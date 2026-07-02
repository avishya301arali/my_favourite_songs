/**
 * MY FAVOURITE SONGS — Stage 2
 *
 * Stage 1 (preserved):  grid rendering · button states · press → active sequence
 * Stage 2 (added):      song data · vinyl artwork loading · guessing system
 */

(() => {
  "use strict";

  /* ═══════════════════════════════════════════
     SONG DATA
  ═══════════════════════════════════════════ */
  const SONGS = [
    {
      id:     "mj_way_you_make_me_feel",
      artist: "Michael Jackson",
      answer: "The Way You Make Me Feel",
      yt: { id: "HzZ_urpj4As", start: 136 },
    },
    {
      id:     "abba_dancing_queen",
      artist: "ABBA",
      answer: "Dancing Queen",
      yt: { id: "xFrGuyw1V8s", start: 86 },
    },
    {
      id:     "pvris_hallucinations",
      artist: "PVRIS",
      answer: "Hallucinations",
      yt: { id: "NzdUeJnn0gM", start: 50 },
    },
    {
      id:     "guns_n_roses_sweet_child_o_mine",
      artist: "Guns N Roses",
      answer: "Sweet Child O Mine",
      yt: { id: "1w7OgIMMRc4", start: 60 },
    },
    {
      id:     "iron_maiden_wasted_years",
      artist: "Iron Maiden",
      answer: "Wasted Years",
      yt: { id: "Ij99dud8-0A", start: 220 },
    },
    {
      id:     "witt_lowry_into_your_arms",
      artist: "Witt Lowry",
      answer: "Into Your Arms",
      yt: { id: "h3YXec5gJi0", start: 150 },
    },
    {
      id:     "i_prevail_deep_end",
      artist: "I Prevail",
      answer: "Deep End",
      yt: { id: "QbSX8x6d5fs", start: 196 },
    },
    {
      id:     "unravel_tokyo_ghoul",
      artist: "TK",
      answer: "Unravel",
      yt: { id: "QKXi08chD2E", start: 158 },
    },
    {
      id:     "bad_omens_just_pretend",
      artist: "Bad Omens",
      answer: "Just Pretend",
      yt: { id: "GLRFl26Q92s", start: 163 },
    },
  ];

  /* ═══════════════════════════════════════════
     CONFIG
  ═══════════════════════════════════════════ */
  const ASSET_BASE   = "assets/songs";
  const PRESS_GIF_MS = 800;   // Duration of press GIF before switching to active
  const MAX_ATTEMPTS = 3;

  /* ═══════════════════════════════════════════
     STATE
  ═══════════════════════════════════════════ */
  let activeSongId   = null;  // Currently selected song ID
  let pressTimers    = {};    // { songId: timeoutId }

  // Guessing state — scoped to the active song
  const guessState = {
    attemptsLeft:    MAX_ATTEMPTS,
    resolved:        false,   // true once correct or out of attempts
    artistConfirmed: false,   // true after a correct artist-only guess (+0.5)
  };

  // Session score — persists for the lifetime of the page, unaffected by Reset
  const sessionScore = {
    counted:      new Set(),  // song IDs with a full point
    halfCounted:  new Set(),  // song IDs with a half point (artist only)
    total:        0,          // displayed score (in 0.5 increments internally)
  };

  // Audio state — single source of truth for what is currently playing
  const audioState = {
    clickAudio: null,   // HTMLAudioElement for sound_1 (song select)
    hintAudio:  null,   // HTMLAudioElement for sound_2/3/4 (hints)
    hintIndex:  null,   // 1-based index of the currently loaded hint (2/3/4)
  };

  /* ═══════════════════════════════════════════
     DOM REFS
  ═══════════════════════════════════════════ */
  const grid            = document.getElementById("songGrid");
  const vinylArtwork    = document.getElementById("vinylArtwork");
  const vinylArtworkWrap = document.getElementById("vinylArtworkWrap");
  const rotationSlider  = document.getElementById("rotationSlider");
  const resetBtn        = document.getElementById("resetBtn");
  const guessInput      = document.getElementById("guessInput");
  const submitBtn       = document.getElementById("submitBtn");
  const attemptsDisplay = document.getElementById("attemptsDisplay");
  const resultMsg       = document.getElementById("resultMsg");
  const hintResultZone  = document.querySelector(".hint-result-zone");
  const scoreValue      = document.getElementById("scoreValue");
  const idkBtn          = document.getElementById("idkBtn");
  const ytPanel         = document.getElementById("ytPanel");
  const ytEmbed         = document.getElementById("ytEmbed");
  const ytClose         = document.getElementById("ytClose");

  /* ═══════════════════════════════════════════
     ASSET PATH HELPERS
  ═══════════════════════════════════════════ */
  const idleSrc   = (id) => `${ASSET_BASE}/${id}/button_idle.png`;
  const pressSrc  = (id) => `${ASSET_BASE}/${id}/button_press.gif`;
  const activeSrc = (id) => `${ASSET_BASE}/${id}/button_active.gif`;
  const vinylSrc  = (id) => `${ASSET_BASE}/${id}/vinyl.png`;
  const audioSrc  = (id, n) => `${ASSET_BASE}/${id}/sound_${n}.mp3`;

  /* ═══════════════════════════════════════════
     STAGE 1 — BUTTON SYSTEM (unchanged)
  ═══════════════════════════════════════════ */

  function getImg(btn) {
    return btn.querySelector(".song-btn__img");
  }

  /**
   * Restart a GIF from frame 1 by cloning the image node and replacing it.
   * The old node stays in the DOM until replaceChild completes, so there is
   * never a blank frame. No URL manipulation, no network request.
   * Returns the new node — callers must use this reference going forward.
   */
  function restartGif(img) {
    const clone = img.cloneNode(true);
    img.parentNode.replaceChild(clone, img);
    return clone;
  }

  function setButtonIdle(btn, img, songId) {
    btn.classList.remove("song-btn--pressing", "song-btn--active");
    btn.setAttribute("aria-pressed", "false");
    const src = idleSrc(songId);
    if (img.src !== src) img.src = src;
  }

  function setButtonPressing(btn, img, songId) {
    clearTimer(songId);
    btn.classList.add("song-btn--pressing");
    btn.classList.remove("song-btn--active");
    btn.setAttribute("aria-pressed", "true");
    img.src = pressSrc(songId);
    const newImg = restartGif(img); // clone restarts GIF, old node never goes blank

    pressTimers[songId] = setTimeout(() => {
      // Use the live node from the DOM, not the stale pre-clone reference
      setButtonActive(btn, getImg(btn), songId);
      delete pressTimers[songId];
    }, PRESS_GIF_MS);
  }

  function setButtonActive(btn, img, songId) {
    btn.classList.remove("song-btn--pressing");
    btn.classList.add("song-btn--active");
    btn.setAttribute("aria-pressed", "true");
    img.src = activeSrc(songId);
    restartGif(img); // restart active GIF clean from frame 1
  }

  function clearTimer(songId) {
    if (pressTimers[songId] != null) {
      clearTimeout(pressTimers[songId]);
      delete pressTimers[songId];
    }
  }

  function deactivateSong(songId) {
    clearTimer(songId);
    const btn = getBtnBySongId(songId);
    if (!btn) return;
    setButtonIdle(btn, getImg(btn), songId);
  }

  function getBtnBySongId(songId) {
    return grid.querySelector(`[data-song="${songId}"]`);
  }

  /* ═══════════════════════════════════════════
     STAGE 1 — GRID BUILDER
  ═══════════════════════════════════════════ */

  function buildGrid() {
    SONGS.forEach((song) => {
      const btn = document.createElement("button");
      btn.className    = "song-btn";
      btn.dataset.song = song.id;
      btn.setAttribute("role", "listitem");
      btn.setAttribute("aria-label", `${song.artist} — ${song.answer}`);
      btn.setAttribute("aria-pressed", "false");

      const img = document.createElement("img");
      img.className = "song-btn__img";
      img.draggable = false;
      img.alt       = "";

      const label = document.createElement("span");
      label.className = "song-btn__label";
      label.textContent = String(SONGS.indexOf(song) + 1);
      label.setAttribute("aria-hidden", "true");

      img.addEventListener("error", () => {
        btn.classList.add("img-missing");
        img.style.display = "none";
      });

      setButtonIdle(btn, img, song.id);

      btn.appendChild(img);
      btn.appendChild(label);

      btn.addEventListener("click", () => handleSongClick(song.id));

      grid.appendChild(btn);
    });
  }

  /* ═══════════════════════════════════════════
     STAGE 1+2 — SONG CLICK HANDLER
  ═══════════════════════════════════════════ */

  function handleSongClick(songId) {
    // Same song — do nothing
    if (activeSongId === songId) return;

    // Deactivate previous
    if (activeSongId !== null) {
      deactivateSong(activeSongId);
    }

    activeSongId = songId;

    const btn = getBtnBySongId(songId);
    if (!btn) return;

    setButtonPressing(btn, getImg(btn), songId);

    // Audio: stop previous, play song select snippet for the new song
    audioManager.stopAll();
    audioManager.playClick(songId);

    // Hide YouTube player when switching songs
    ytManager.hide();

    // Stage 3: reset rotation for incoming song, enable slider + reset button
    vinylArtworkWrap.style.transform = "rotate(0deg)";
    rotationSlider.value    = 0;
    rotationSlider.disabled = false;
    resetBtn.disabled       = false;

    // Stage 2: load vinyl and reset game state for new song
    loadVinylArtwork(songId);
    resetGuessState();
  }

  /* ═══════════════════════════════════════════
     STAGE 2 — VINYL ARTWORK
  ═══════════════════════════════════════════ */

  /**
   * Fade out current artwork, swap src, fade in new artwork.
   * Uses a cross-fade approach: hide → swap src → show.
   */
  function loadVinylArtwork(songId) {
    // Step 1: hide existing artwork immediately (no transition flicker)
    vinylArtwork.classList.remove("vinyl-artwork--visible");

    const src = vinylSrc(songId);

    // Step 2: once the hide transition starts, swap the src
    // Small delay lets the CSS transition kick off, then we load the new image
    setTimeout(() => {
      vinylArtwork.src = "";
      vinylArtwork.src = src;

      // Step 3: after image loads, animate in
      vinylArtwork.onload = () => {
        // Guard: only show if this song is still active (user may have clicked away)
        if (activeSongId === songId) {
          // Next frame ensures the transition property is active before we set visible
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              vinylArtwork.classList.add("vinyl-artwork--visible");
            });
          });
        }
      };

      // Graceful fallback if image doesn't exist
      vinylArtwork.onerror = () => {
        // Keep area empty — no broken image icon
        vinylArtwork.src = "";
      };
    }, 80); // short delay so opacity-0 transition is in flight before src swaps
  }

  /**
   * Clear the vinyl area (used when no song is active).
   */
  function clearVinylArtwork() {
    vinylArtwork.classList.remove("vinyl-artwork--visible");
    setTimeout(() => { vinylArtwork.src = ""; }, 300);
  }

  /* ═══════════════════════════════════════════
     STAGE 3 — AUDIO MANAGER
  ═══════════════════════════════════════════ */

  /**
   * Central audio manager.
   * Two persistent HTMLAudioElement slots (clickAudio, hintAudio) are reused
   * for every playback operation. This prevents overlapping instances when
   * users click rapidly and avoids the memory/event-listener accumulation
   * that comes from creating new Audio() objects on every interaction.
   */
  const audioManager = (() => {

    /** Load a src into an audio slot, returning the element. */
    function _load(slot, src) {
      slot.pause();
      slot.currentTime = 0;
      slot.src = src;
      slot.loop = false;
      return slot;
    }

    /** Play an audio element, logging gracefully if the file is missing. */
    function _play(el, label) {
      el.play().catch((err) => {
        if (err.name === "NotSupportedError" || err.name === "NotAllowedError") {
          // NotSupportedError = file missing/unreadable; NotAllowedError = autoplay policy
          console.warn(`[audio] Could not play ${label}:`, err.message);
        }
        // Other errors (AbortError from rapid src swap) are safe to ignore
      });
    }

    return {
      /**
       * Load and play sound_1 for the given song.
       * Stops any currently playing click or hint audio first.
       */
      playClick(songId) {
        // Stop hint audio
        if (audioState.hintAudio) {
          audioState.hintAudio.pause();
          audioState.hintAudio.currentTime = 0;
          audioState.hintIndex = null;
        }
        // Initialise the click slot lazily
        if (!audioState.clickAudio) audioState.clickAudio = new Audio();
        const src = audioSrc(songId, 1);
        _load(audioState.clickAudio, src);
        _play(audioState.clickAudio, `sound_1 for ${songId}`);
      },

      /**
       * Play a hint snippet (n = 2, 3, or 4).
       * Clicking the same hint restarts it; clicking a different hint stops the current one.
       */
      playHint(songId, n, btn, originalLabel) {
        if (!audioState.hintAudio) audioState.hintAudio = new Audio();
        const src = audioSrc(songId, n);
        // Always reload — handles both "same hint restart" and "different hint switch"
        _load(audioState.hintAudio, src);
        audioState.hintIndex = n;

        // Clear all hint buttons first
        const hintBtns = document.querySelectorAll(".hint-btn");
        hintBtns.forEach(b => {
          b.classList.remove("hint-btn--active");
          // Restore original label on any previously-active button
          if (b.dataset.origLabel) {
            b.textContent = b.dataset.origLabel;
            delete b.dataset.origLabel;
          }
        });

        // Set this button to active / "stop"
        if (btn) {
          btn.dataset.origLabel = originalLabel;
          btn.textContent = "stop";
          btn.classList.add("hint-btn--active");
        }

        // Restore label when clip ends naturally
        audioState.hintAudio.addEventListener("ended", () => {
          if (btn) {
            btn.classList.remove("hint-btn--active");
            btn.textContent = originalLabel;
            delete btn.dataset.origLabel;
          }
        }, { once: true });

        _play(audioState.hintAudio, `sound_${n} for ${songId}`);
      },

      /** Stop the currently-playing hint and revert the button label. */
      stopHint(btn, originalLabel) {
        if (audioState.hintAudio) {
          audioState.hintAudio.pause();
          audioState.hintAudio.currentTime = 0;
          audioState.hintIndex = null;
        }
        if (btn) {
          btn.classList.remove("hint-btn--active");
          btn.textContent = originalLabel;
          delete btn.dataset.origLabel;
        }
      },

      /** Pause all audio immediately (used on song switch and reset). */
      stopAll() {
        if (audioState.clickAudio) {
          audioState.clickAudio.pause();
          audioState.clickAudio.currentTime = 0;
        }
        if (audioState.hintAudio) {
          audioState.hintAudio.pause();
          audioState.hintAudio.currentTime = 0;
          audioState.hintIndex = null;
        }
        // Clear active state and restore original labels on all hint buttons
        document.querySelectorAll(".hint-btn").forEach(b => {
          b.classList.remove("hint-btn--active");
          if (b.dataset.origLabel) {
            b.textContent = b.dataset.origLabel;
            delete b.dataset.origLabel;
          }
        });
      },

      /**
       * Full reset: stop everything and discard the audio elements so they
       * can be garbage-collected and recreated clean for the next song.
       */
      reset() {
        this.stopAll();
        audioState.clickAudio = null;
        audioState.hintAudio  = null;
        audioState.hintIndex  = null;
      },
    };
  })();

  /* ═══════════════════════════════════════════
     STAGE 4 — YOUTUBE PLAYER + VINYL SPINNER
  ═══════════════════════════════════════════ */

  /**
   * Manages the single reused YouTube IFrame player.
   * The YouTube IFrame API is loaded lazily on first use.
   */
  const ytManager = (() => {
    let player = null;
    let apiReady = false;
    let pendingSong = null;  // song to load once API is ready

    // Expose the YT ready callback globally — the API calls this when loaded
    window.onYouTubeIframeAPIReady = () => {
      apiReady = true;
      if (pendingSong) {
        _createPlayer(pendingSong);
        pendingSong = null;
      }
    };

    function _loadAPI() {
      if (document.getElementById("yt-api-script")) return; // already loading
      const s = document.createElement("script");
      s.id  = "yt-api-script";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }

    function _createPlayer(song) {
      // Clear existing embed content
      ytEmbed.innerHTML = "";
      const div = document.createElement("div");
      ytEmbed.appendChild(div);

      player = new YT.Player(div, {
        height: "100%",
        width:  "100%",
        videoId: song.yt.id,
        playerVars: {
          start:       song.yt.start,
          autoplay:    0,
          rel:         0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) {
              vinylSpinner.start();
            } else {
              vinylSpinner.stop();
            }
          },
        },
      });
    }

    return {
      /** Show the panel and load (or cue) the given song. */
      show(song) {
        ytPanel.hidden = false;
        if (!apiReady) {
          _loadAPI();
          pendingSong = song;
          return;
        }
        if (player && typeof player.cueVideoById === "function") {
          player.cueVideoById({ videoId: song.yt.id, startSeconds: song.yt.start });
        } else {
          _createPlayer(song);
        }
      },

      /** Stop playback and hide the panel. */
      hide() {
        ytPanel.hidden = true;
        vinylSpinner.stop();
        if (player && typeof player.stopVideo === "function") {
          player.stopVideo();
        }
      },

      /** Full teardown — called on song switch so the player doesn't bleed audio. */
      reset() {
        this.hide();
        if (player && typeof player.destroy === "function") {
          player.destroy();
          player = null;
        }
        ytEmbed.innerHTML = "";
      },
    };
  })();

  /**
   * Handles smooth continuous vinyl rotation during YouTube playback.
   * Reads the current manual slider angle so it never jumps on start/stop.
   * The manual slider continues to work — its `input` event overrides
   * the CSS animation transform directly, which takes precedence over
   * the animation's current keyframe.
   */
  const vinylSpinner = (() => {
    let spinning = false;

    return {
      start() {
        if (spinning) return;
        spinning = true;
        // Capture the current rotation angle from the slider so we start
        // spinning from wherever the user left the artwork, not from 0.
        const currentDeg = parseInt(rotationSlider.value, 10) || 0;
        vinylArtworkWrap.style.setProperty("--vinyl-start-deg", `${currentDeg}deg`);
        vinylArtworkWrap.classList.add("vinyl-artwork-wrap--spinning");
      },

      stop() {
        if (!spinning) return;
        spinning = false;
        // Freeze at the current visual rotation angle before removing animation
        const computed = window.getComputedStyle(vinylArtworkWrap).transform;
        vinylArtworkWrap.classList.remove("vinyl-artwork-wrap--spinning");
        // Apply the frozen angle so there's no snap-back to slider value
        vinylArtworkWrap.style.transform = computed;
        // Parse the angle back so the slider stays in sync if user touches it
        const matrix = new DOMMatrix(computed);
        const angle  = Math.round(Math.atan2(matrix.b, matrix.a) * (180 / Math.PI));
        rotationSlider.value = ((angle % 360) + 360) % 360;
      },
    };
  })();

  /* ═══════════════════════════════════════════
     STAGE 3 — GUESSING SYSTEM
  ═══════════════════════════════════════════ */

  /**
   * Reset everything for a freshly selected song.
   */
  function resetGuessState() {
    guessState.attemptsLeft    = MAX_ATTEMPTS;
    guessState.resolved        = false;
    guessState.artistConfirmed = false;

    // Clear fields
    guessInput.value = "";
    clearResult();

    // Enable input and hint buttons
    setGuessEnabled(true);
    setHintsEnabled(true);
    updateAttemptsDisplay();
    guessInput.focus();
  }

  /**
   * Enable or disable the three hint buttons.
   */
  function setHintsEnabled(enabled) {
    document.querySelectorAll(".hint-btn").forEach((btn) => {
      btn.disabled = !enabled;
      btn.style.cursor = enabled ? "pointer" : "not-allowed";
      btn.style.opacity = enabled ? "1" : "";
    });
    idkBtn.disabled = !enabled;
  }

  /**
   * Enable or disable the guess input + submit button.
   */
  function setGuessEnabled(enabled) {
    guessInput.disabled = !enabled;
    submitBtn.disabled  = !enabled;
    if (enabled) {
      guessInput.setAttribute("aria-label", "Type your song guess");
    } else {
      guessInput.setAttribute("aria-label", "Guess (select a song first)");
    }
  }

  /**
   * Update the attempts counter text.
   */
  /**
   * Award a point for the given song if it hasn't been counted this session.
   * Called once per correct guess.
   */
  function updateScore(songId, half = false) {
    if (sessionScore.counted.has(songId)) return; // already a full point — don't add more
    if (half) {
      if (sessionScore.halfCounted.has(songId)) return; // already have the half point
      sessionScore.halfCounted.add(songId);
      sessionScore.total += 0.5;
    } else {
      // Full point: if we had a half point, top up by 0.5, else add full 1
      if (sessionScore.halfCounted.has(songId)) {
        sessionScore.halfCounted.delete(songId);
        sessionScore.total += 0.5; // already had +0.5, top up to +1
      } else {
        sessionScore.total += 1;
      }
      sessionScore.counted.add(songId);
    }
    // Display — show as whole numbers when possible, e.g. "1 / 9" not "1.0 / 9"
    const display = Number.isInteger(sessionScore.total)
      ? sessionScore.total
      : sessionScore.total.toFixed(1);
    scoreValue.textContent = `${display} / ${SONGS.length}`;
  }

  function updateAttemptsDisplay() {
    if (guessState.resolved) {
      attemptsDisplay.textContent = "";
      attemptsDisplay.className   = "attempts-display";
      return;
    }

    const n = guessState.attemptsLeft;
    attemptsDisplay.textContent = `Attempts remaining: ${n}`;

    // Color-code urgency
    attemptsDisplay.className = "attempts-display";
    if (n === 2) attemptsDisplay.classList.add("attempts-display--warning");
    if (n === 1) attemptsDisplay.classList.add("attempts-display--danger");
  }

  /**
   * Strip punctuation, apostrophes, casing, and extra whitespace for comparison.
   */
  function normalizeAnswer(str) {
    return str
      .toLowerCase()
      .replace(/[''`\u2018\u2019]/g, "")   // apostrophes / smart quotes
      .replace(/[^a-z0-9\s]/g, "")          // remaining punctuation
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Handle a guess submission.
   */
  function submitGuess() {
    if (guessState.resolved) return;
    if (!activeSongId) return;

    const raw   = guessInput.value;
    const guess = normalizeAnswer(raw);

    if (!guess) return; // empty input — do nothing

    const song       = SONGS.find((s) => s.id === activeSongId);
    const target     = normalizeAnswer(song.answer);
    const artistNorm = normalizeAnswer(song.artist);

    // ── Full correct answer (or song title alone after artist confirmed) ──
    if (guess === target || (guessState.artistConfirmed && guess === normalizeAnswer(song.answer))) {
      guessState.resolved = true;
      setGuessEnabled(false);
      updateAttemptsDisplay();
      showCorrect(song);

    // ── Artist-only correct (and song not yet confirmed) ──
    } else if (!guessState.artistConfirmed && guess === artistNorm) {
      guessState.artistConfirmed = true;
      updateScore(activeSongId, true); // +0.5
      guessInput.value = "";
      showArtistCorrect(song);

    } else {
      // ── Wrong ──
      guessState.attemptsLeft -= 1;

      if (guessState.attemptsLeft <= 0) {
        // Out of attempts
        guessState.resolved = true;
        setGuessEnabled(false);
        updateAttemptsDisplay();
        showReveal(song);
      } else {
        // Still has attempts — clear input, shake field, update counter
        guessInput.value = "";
        updateAttemptsDisplay();
        shakeInput();
        guessInput.focus();
      }
    }
  }

  /**
   * Brief shake animation on wrong guess to give tactile feedback.
   */
  function shakeInput() {
    guessInput.classList.remove("input--shake");
    // Force reflow so re-adding the class triggers the animation
    void guessInput.offsetWidth;
    guessInput.classList.add("input--shake");
    guessInput.addEventListener("animationend", () => {
      guessInput.classList.remove("input--shake");
    }, { once: true });
  }

  /* ── Result display ── */

  /**
   * Append a small "Listen to the Song" button to the result area.
   * Called after both correct guesses and reveals.
   */
  function showListenButton(song) {
    if (!song.yt) return; // no YouTube data for this song
    const btn = document.createElement("button");
    btn.className   = "listen-btn";
    btn.textContent = "♪  listen to the song";
    btn.addEventListener("click", () => ytManager.show(song));
    resultMsg.appendChild(btn);
  }

  function clearResult() {
    hintResultZone.classList.remove("hint-result-zone--solved");
    resultMsg.className   = "result-msg";
    resultMsg.innerHTML   = "";
    attemptsDisplay.textContent = "";
    attemptsDisplay.innerHTML   = "";
  }

  function showArtistCorrect(song) {
    // Brief flash in the attempts area — doesn't use hint-result-zone overlay
    // so hints stay visible and usable
    attemptsDisplay.innerHTML = `<span class="artist-correct-msg">artist correct — now guess the song title</span>`;
    // Restore normal "Attempts remaining" after 2.5 s
    setTimeout(() => {
      if (!guessState.resolved) updateAttemptsDisplay();
    }, 2500);
    guessInput.focus();
  }

  function showCorrect(song) {
    hintResultZone.classList.add("hint-result-zone--solved");
    resultMsg.className = "result-msg result-msg--correct";
    resultMsg.innerHTML = `
      <span class="result-inline">
        <span class="result-label">Correct</span>
        <span class="result-sep">—</span>${escHtml(song.artist)}<span class="result-sep">—</span><span class="result-song">${escHtml(song.answer)}</span>
      </span>
    `;
    updateScore(song.id);
    showListenButton(song);
  }

  function showReveal(song) {
    hintResultZone.classList.add("hint-result-zone--solved");
    resultMsg.className = "result-msg result-msg--reveal";
    resultMsg.innerHTML = `
      <span class="result-inline">
        <span class="result-label">Answer</span><span class="result-band">${escHtml(song.artist)}</span><span class="result-sep">—</span><span class="result-song">${escHtml(song.answer)}</span>
      </span>
    `;
    showListenButton(song);
  }

  /** Minimal HTML escape to prevent XSS from song data */
  function escHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ═══════════════════════════════════════════
     STAGE 2 — EVENT BINDINGS
  ═══════════════════════════════════════════ */

  function bindGuessEvents() {
    // Submit on button click
    submitBtn.addEventListener("click", submitGuess);

    // Submit on Enter key
    guessInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitGuess();
      }
    });
  }

  /* ═══════════════════════════════════════════
     STAGE 3 — VINYL ROTATION
  ═══════════════════════════════════════════ */

  /**
   * Rotate the artwork wrapper in real time as the slider moves.
   * The wrapper has no CSS transition so this is instant — buttery smooth.
   */
  function bindRotationSlider() {
    rotationSlider.addEventListener("input", () => {
      vinylArtworkWrap.style.transform = `rotate(${rotationSlider.value}deg)`;
    });
  }

  /* ═══════════════════════════════════════════
     STAGE 3 — RESET
  ═══════════════════════════════════════════ */

  /**
   * Return everything to the exact initial state (like a fresh page load).
   * Safe to call at any point — mid-press, post-correct, post-reveal, etc.
   */
  function fullReset() {
    // ── 0. Audio ──
    audioManager.reset();

    // ── 1. Song buttons ──
    // Cancel any in-flight press timer and return active button to idle
    if (activeSongId !== null) {
      deactivateSong(activeSongId);
      activeSongId = null;
    }

    // ── 2. Vinyl artwork ──
    // Let CSS opacity transition fade the artwork out gracefully,
    // then clear the src once invisible.
    vinylArtwork.classList.remove("vinyl-artwork--visible");
    setTimeout(() => {
      // Guard: only clear if still no song active (user didn't click mid-fade)
      if (activeSongId === null) {
        vinylArtwork.src = "";
      }
    }, 520);

    // ── 3. Rotation ──
    vinylArtworkWrap.style.transform = "rotate(0deg)";
    rotationSlider.value    = 0;
    rotationSlider.disabled = true;

    // ── 4. Guess system ──
    guessInput.value    = "";
    guessInput.disabled = true;
    submitBtn.disabled  = true;
    setHintsEnabled(false);
    idkBtn.disabled     = true;

    guessState.attemptsLeft    = MAX_ATTEMPTS;
    guessState.resolved        = false;
    guessState.artistConfirmed = false;

    attemptsDisplay.textContent = "";
    attemptsDisplay.className   = "attempts-display";
    hintResultZone.classList.remove("hint-result-zone--solved");
    resultMsg.className         = "result-msg";
    resultMsg.innerHTML         = "";

    // ── 5. YouTube player ──
    ytManager.reset();

    // ── 6. Reset button ──
    // Disable itself — project is back to fresh-page state
    resetBtn.disabled = true;
  }

  function bindResetButton() {
    resetBtn.addEventListener("click", fullReset);
  }

  /**
   * Wire the three hint buttons to their audio snippets.
   * Hint 1 → sound_2, Hint 2 → sound_3, Hint 3 → sound_4.
   */
  function bindHintButtons() {
    const hintBtns = document.querySelectorAll(".hint-btn");
    hintBtns.forEach((btn, i) => {
      const soundIndex = i + 2; // 0→sound_2, 1→sound_3, 2→sound_4
      const originalLabel = btn.textContent;

      btn.addEventListener("click", () => {
        if (!activeSongId) return;

        // If this button is currently active (playing), stop it
        if (btn.classList.contains("hint-btn--active")) {
          audioManager.stopHint(btn, originalLabel);
          return;
        }

        // Otherwise start playing — label changes to "stop" via playHint
        audioManager.playHint(activeSongId, soundIndex, btn, originalLabel);
      });
    });

    // I Don't Know button
    idkBtn.addEventListener("click", () => {
      if (!activeSongId || guessState.resolved) return;
      const song = SONGS.find((s) => s.id === activeSongId);
      guessState.resolved = true;
      audioManager.stopAll();
      setGuessEnabled(false);
      setHintsEnabled(false);
      updateAttemptsDisplay();
      showReveal(song);
      // No score awarded
    });
  }

  /* ═══════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════ */

  function init() {
    buildGrid();
    bindGuessEvents();
    bindRotationSlider();  // Stage 3
    bindResetButton();     // Stage 3
    bindHintButtons();     // Stage 3
    preloadAllAssets();    // Background preload — does not block initial render
    ytClose.addEventListener("click", () => ytManager.hide());
  }

  /**
   * Preload every song's images and audio in the background so the first
   * click on any song button feels identical to subsequent clicks.
   * Failures are logged but never block gameplay — each asset preloads
   * independently and the game works fine even if one is missing.
   */
  function preloadAllAssets() {
    SONGS.forEach((song) => {
      const id = song.id;

      // ── Images: idle, press, active, vinyl artwork ──
      [idleSrc(id), pressSrc(id), activeSrc(id), vinylSrc(id)].forEach((src) => {
        const img = new Image();
        img.onerror = () => console.warn(`[preload] Failed to load image: ${src}`);
        img.src = src;
      });

      // ── Audio: sound_1 through sound_4 ──
      for (let n = 1; n <= 4; n++) {
        const src = audioSrc(id, n);
        const audio = new Audio();
        audio.preload = "auto";
        audio.onerror = () => console.warn(`[preload] Failed to load audio: ${src}`);
        audio.src = src;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
