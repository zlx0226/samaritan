(function () {
  'use strict';

  const CFG = window.ROOF_UI_CONFIG;
  let stage = null;
  let startPrologue = null;
  const roomProgress = {
    seenPortrait: false,
    visitedCorridor: false
  };
  const hqProgress = {
    keyTaken: false,
    corridor901Locked: false
  };

  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (((a.y > p.y) !== (b.y > p.y)) &&
          (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) {
        inside = !inside;
      }
    }
    return inside;
  }

  let hqFlickerTimer = null;

  function startHqFlicker(scene) {
    if (!scene || hqFlickerTimer) return;
    scene.classList.remove('is-off');
    const pulse = () => {
      scene.classList.add('is-off');
      setTimeout(() => {
        scene.classList.remove('is-off');
        setTimeout(() => {
          scene.classList.add('is-off');
          setTimeout(() => {
            scene.classList.remove('is-off');
          }, 110);
        }, 100);
      }, 110);
    };
    hqFlickerTimer = setInterval(pulse, 5000);
  }

  function enterHqBase() {
    const hqScene = document.getElementById('hqScene');
    const corridorScene = document.getElementById('corridorScene');
    const roomScene = document.getElementById('roomScene');
    if (!hqScene) return;
    if (corridorScene) corridorScene.hidden = true;
    if (roomScene) roomScene.hidden = true;
    const corridorPerson = document.getElementById('corridorPerson');
    if (corridorPerson) corridorPerson.hidden = true;
    hqScene.hidden = false;
    syncHqKey();
    startHqFlicker(hqScene);
  }

  function syncHqKey() {
    const key = document.querySelector('.hq-key');
    if (key) key.hidden = hqProgress.keyTaken;
    document.querySelectorAll('#hqHitLayer .hq-hit-area[data-id="key"]')
      .forEach((element) => { element.hidden = hqProgress.keyTaken; });
  }

  function leaveHqBase() {
    const hqScene = document.getElementById('hqScene');
    if (!hqScene || hqScene.hidden) return;
    hqScene.hidden = true;
    const roomScene = document.getElementById('roomScene');
    if (roomScene) roomScene.hidden = true;
    const corridorScene = document.getElementById('corridorScene');
    if (corridorScene) corridorScene.hidden = false;
    const corridorPerson = document.getElementById('corridorPerson');
    if (corridorPerson) {
      corridorPerson.hidden = false;
      beginCorridorPlayerMovement(corridorPerson);
    }
    window.dispatchEvent(new CustomEvent('corridor:resume', {
      detail: { x: 23.44, y: 40, facing: 'up' }
    }));
  }

  function buildCorridorCollisionDebug() {
    const scene = document.getElementById('corridorScene');
    const boxes = CFG.corridorCollisionBoxes || [];
    if (!scene || !boxes.length) return;
    scene.querySelectorAll('.corridor-collision-debug')
      .forEach((element) => element.remove());
    boxes.forEach((box, index) => {
      const rect = box.rect;
      const element = document.createElement('div');
      element.className = 'corridor-collision-debug';
      element.id = box.id;
      element.dataset.label = (index + 1) + '号';
      if (CFG.corridorCollisionDebugVisible === true) {
        element.classList.add('is-debug');
      }
      element.style.left = rect[0] / 1300 * 100 + '%';
      element.style.top = rect[1] / 720 * 100 + '%';
      element.style.width = (rect[2] - rect[0]) / 1300 * 100 + '%';
      element.style.height = (rect[3] - rect[1]) / 720 * 100 + '%';
      scene.appendChild(element);
    });
  }

  function showHqInteractionDialogue(lines, onEnd) {
    const scene = document.getElementById('hqScene');
    const box = document.getElementById('hqDialogue');
    const text = document.getElementById('hqDialogueText');
    if (!scene || !box || !text || !lines || !lines.length || !box.hidden) return;

    let index = 0;
    let timer = null;
    let completeText = '';
    let complete = false;

    scene.classList.add('is-dialogue');
    box.hidden = false;
    text.textContent = '';
    document.querySelectorAll('.hq-hit-area.is-linked-hover')
      .forEach((element) => element.classList.remove('is-linked-hover'));

    const finishTyping = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      text.textContent = completeText;
      complete = true;
    };

    const cleanup = (completed = false) => {
      if (timer) clearInterval(timer);
      timer = null;
      box.hidden = true;
      scene.classList.remove('is-dialogue');
      box.removeEventListener('click', advance);
      window.removeEventListener('keydown', onKey);
      if (onEnd) onEnd(completed);
    };

    const advance = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (timer) {
        finishTyping();
        return;
      }
      if (!complete) return;
      if (index < lines.length - 1) {
        index += 1;
        showLine();
      } else {
        cleanup(true);
      }
    };

    const onKey = (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      advance(event);
    };

    const showLine = () => {
      if (timer) clearInterval(timer);
      timer = null;
      complete = false;
      completeText = String(lines[index] || '');
      text.textContent = '';
      let charIndex = 0;
      const delay = (CFG.dialogue && CFG.dialogue.charDelay) || 38;
      timer = setInterval(() => {
        charIndex += 1;
        text.textContent = completeText.slice(0, charIndex);
        if (charIndex >= completeText.length) finishTyping();
      }, delay);
    };

    box.addEventListener('click', advance);
    window.addEventListener('keydown', onKey);
    showLine();
  }

  function showHqKeyPreview(interaction) {
    const preview = document.getElementById('hqKeyPreview');
    const image = document.getElementById('hqKeyPreviewImage');
    const area = interaction.areas && interaction.areas[0];
    if (!preview || !image || !area) return;
    const width = area[2] - area[0];
    if (width <= 0) return;
    const imageWidth = 70 / width * 100;
    const imageHeight = imageWidth * 1080 / 1920;
    const centerX = (area[0] + area[2]) / 200;
    const centerY = (area[1] + area[3]) / 200;
    image.style.width = imageWidth + '%';
    image.style.left = (50 - centerX * imageWidth) + '%';
    image.style.top = (50 - centerY * imageHeight) + '%';
    preview.hidden = false;
  }

  function collectHqKey() {
    hqProgress.keyTaken = true;
    hqProgress.corridor901Locked = true;
    syncHqKey();
    const door = document.getElementById('corridorGdoor901');
    if (door) {
      door.dataset.locked = 'true';
      door.classList.add('is-locked');
    }
    window.dispatchEvent(new CustomEvent('game:hq-key-taken', {
      detail: { doorId: 'corridorGdoor901' }
    }));
  }

  function buildHqInteractionAreas() {
    const layer = document.getElementById('hqHitLayer');
    const interactions = CFG.hqInteractions || [];
    if (!layer || !interactions.length) return;
    layer.innerHTML = '';
    interactions.forEach((interaction) => {
      (interaction.areas || []).forEach((rect, index) => {
        const element = document.createElement('div');
        element.className = 'hq-hit-area';
        element.dataset.id = interaction.id;
        if (interaction.action) element.dataset.action = interaction.action;
        if (interaction.action) {
          const setLinkedHover = (active) => {
            layer.querySelectorAll('.hq-hit-area').forEach((other) => {
              if (other.dataset.action === interaction.action) {
                other.classList.toggle('is-linked-hover', active);
              }
            });
          };
          element.addEventListener('pointerenter', () => setLinkedHover(true));
          element.addEventListener('pointerleave', () => setLinkedHover(false));
        }
        if (interaction.lines && interaction.lines.length) {
          element.addEventListener('click', (event) => {
            event.stopPropagation();
            const isKey = interaction.id === 'key';
            if (isKey) showHqKeyPreview(interaction);
            showHqInteractionDialogue(interaction.lines, (completed) => {
              const preview = document.getElementById('hqKeyPreview');
              if (preview) preview.hidden = true;
              if (isKey && completed) collectHqKey();
            });
          });
        }
        element.dataset.label =
          interaction.label + (interaction.areas.length > 1 ? ' ' + (index + 1) : '');
        if (CFG.hqInteractionDebugVisible === true) {
          element.classList.add('is-debug');
        }
        if (Number.isFinite(interaction.zIndex)) {
          element.style.zIndex = String(interaction.zIndex);
        }
        element.style.left = rect[0] + '%';
        element.style.top = rect[1] + '%';
        element.style.width = (rect[2] - rect[0]) + '%';
        element.style.height = (rect[3] - rect[1]) + '%';
        layer.appendChild(element);
      });
    });
  }

  function initGameCover() {
    const cover = document.getElementById('gameCover');
    const button = document.getElementById('gameStart');
    const roomScene = document.getElementById('roomScene');
    const debugInput = document.getElementById('gameDebugInput');
    const line = document.getElementById('gameCoverLine');
    const elderSpeech = document.getElementById('roomElderSpeech');
    const roomPerson = document.getElementById('roomPerson');
    const roomDialogue = document.getElementById('roomDialogue');
    const roomDialogueName = document.getElementById('roomDialogueName');
    const roomDialogueText = document.getElementById('roomDialogueText');
    let roomPlotStarted = false;
    if (!cover || !button) return;
    buildCorridorCollisionDebug();
    buildHqInteractionAreas();
    const leaveButton = document.getElementById('hqLeaveButton');
    const nextButton = document.getElementById('hqNextButton');
    if (leaveButton) leaveButton.addEventListener('click', leaveHqBase);
    if (nextButton) {
      nextButton.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('game:hq-next-room', {
          detail: { from: '901' }
        }));
      });
    }
    let started = false;
    const demoStartInComms = false;
    button.addEventListener('click', () => {
      if (started) return;
      started = true;
      button.disabled = true;
      const debugMode = debugInput ? debugInput.value.trim() : '';
      if (debugMode === '1') {
        cover.hidden = true;
        if (roomScene) roomScene.hidden = false;
        if (elderSpeech) elderSpeech.hidden = true;
        if (roomDialogue) roomDialogue.hidden = true;
        const paper = document.getElementById('roomPaper');
        if (paper) paper.hidden = true;
        if (roomPerson) {
          roomPerson.src = 'assets/P_side.png';
          roomPerson.style.left = '57.8%';
          roomPerson.style.top = '57.2%';
          roomPerson.style.transform = 'translate(-50%, -50%)';
          roomPerson.dataset.standing = 'true';
        }
        stage.classList.add('is-room-scene');
        setTimeout(() => {
          updateRoomCharacterDepth();
          beginRoomPlayerMovement(roomPerson);
        }, 0);
        return;
      }
      if (debugMode === '2') {
        cover.hidden = true;
        if (roomScene) roomScene.hidden = true;
        startPrologue();
        return;
      }
      /* 演示模式：暂时跳过 905 前置剧情，直接进入旧通讯流程。 */
      if (debugMode === '3') {
        cover.hidden = true;
        enterHqBase();
        return;
      }
      if (demoStartInComms) {
        cover.hidden = true;
        if (roomScene) roomScene.hidden = true;
        startPrologue();
        return;
      }
      cover.classList.add('is-blackout');
      if (line) line.style.opacity = '1';
      const lineStartedAt = performance.now();
      setTimeout(() => {
        let revealed = false;
        const reveal = () => {
          if (revealed) return;
          revealed = true;
          cover.hidden = true;
          stage.classList.add('is-room-scene');
          setTimeout(updateRoomCharacterDepth, 0);
          if (elderSpeech) {
            elderSpeech.hidden = false;
            setTimeout(() => {
              elderSpeech.hidden = true;
              if (roomPerson) roomPerson.src = 'assets/P.png';
              setTimeout(updateRoomCharacterDepth, 0);
              setTimeout(() => {
                if (roomDialogue) {
                  roomDialogue.hidden = false;
                  if (!roomPlotStarted) {
                    roomPlotStarted = true;
                    startRoomPlot(
                      roomDialogue,
                      roomDialogueName,
                      roomDialogueText,
                      () => standRoomPerson(roomPerson)
                    );
                  }
                }
              }, 500);
            }, 1000);
          }
        };
        const startedAt = performance.now();
        const timer = setInterval(() => {
          const progress = Math.min(1, (performance.now() - startedAt) / 3000);
          const eased = progress * progress * progress;
          const value = Math.round(255 * eased);
          cover.style.backgroundColor =
            'rgb(' + value + ',' + value + ',' + value + ')';
          if (line) {
            const lineFade = Math.min(1,
              (performance.now() - lineStartedAt) / 2000);
            line.style.opacity = String(1 - lineFade);
          }
          if (progress >= 1) {
            clearInterval(timer);
            reveal();
          }
        }, 16);
      }, 120);
    });
    if (debugInput) {
      debugInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        button.click();
      });
    }
  }

  function blockEscapeDuringDialogue(event) {
    if (event.key !== 'Escape') return;
    if (!document.querySelector('.room-dialogue:not([hidden])')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function standRoomPerson(person) {
    if (!person) return Promise.resolve();
    if (person.dataset.standing === 'true') {
      person.src = 'assets/P_side.png';
      return Promise.resolve();
    }
    person.dataset.standing = 'true';
    const duration = (CFG.dialogue && CFG.dialogue.poseTurnMs) || 1000;
    const startedAt = performance.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const progress = Math.min(1, (performance.now() - startedAt) / duration);
        const eased = progress < .5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const angle = 180 + 180 * eased;
        person.style.transform =
          'translate(-50%, -50%) rotate(' + angle.toFixed(2) + 'deg)';
        if (progress >= 1) {
          clearInterval(timer);
          person.style.transform = 'translate(-50%, -50%)';
          person.src = 'assets/P_side.png';
          setTimeout(updateRoomCharacterDepth, 0);
          setTimeout(resolve, 0);
        }
      }, 16);
    });
  }

  function beginRoomPlayerMovement(person) {
    if (!person || person.dataset.movementEnabled === 'true') return;
    person.dataset.movementEnabled = 'true';
    updateRoomCharacterDepth();
    const M = CFG.roomMovement || {};
    const bounds = (M.bounds || []).map((point) => ({
      x: point[0],
      y: point[1]
    }));
    const speed = M.speedPctPerSecond || 27;
    const playerHeight = 21.42;
    const halfHeight = playerHeight / 2;
    const keys = new Set();
    let x = parseFloat(person.style.left);
    let y = parseFloat(person.style.top);
    if (!isFinite(x)) x = 57.8;
    if (!isFinite(y)) y = 57.2;
    person.style.left = x + '%';
    person.style.top = y + '%';
    let facing = 'right';
    const interactionBubble = document.getElementById('roomInteractionBubble');
    const dialogueBox = document.getElementById('roomDialogue');
    const dialogueName = document.getElementById('roomDialogueName');
    const dialogueText = document.getElementById('roomDialogueText');
    const investigationOverlay = document.getElementById('investigationOverlay');
    const investigationName = document.getElementById('investigationName');
    const investigationBig = document.getElementById('investigationBig');
    const investigationInfo = document.getElementById('investigationInfo');
    const investigationExit = document.getElementById('investigationExit');
    const roomElderName = document.getElementById('roomElderName');
    const interactions = CFG.roomInteractions || [];
    const interactionRadius = M.interactionRadius || 14;
    let activeInteraction = null;
    let interactionLocked = false;
    const characterChoiceEl = document.getElementById('roomCharacterChoice');
    const characterChoiceButtons = characterChoiceEl
      ? Array.from(characterChoiceEl.querySelectorAll('button'))
      : [];
    let characterChoiceTarget = null;
    let characterChoiceKeyHandler = null;
    let characterActionKeyHandler = null;
    let activeInteractionDialogueCleanup = null;
    let activeCharacterActionTarget = null;

    const setFacing = (direction) => {
      if (direction === facing) return;
      facing = direction;
      if (direction === 'up') {
        person.src = 'assets/P_back.png';
        person.style.transform = 'translate(-50%, -50%)';
      } else if (direction === 'down') {
        person.src = 'assets/P.png';
        person.style.transform = 'translate(-50%, -50%)';
      } else if (direction === 'left') {
        person.src = 'assets/P_side.png';
        person.style.transform = 'translate(-50%, -50%) scaleX(-1)';
      } else {
        person.src = 'assets/P_side.png';
        person.style.transform = 'translate(-50%, -50%)';
      }
    };

    const refreshElderName = () => {
      if (roomElderName) roomElderName.hidden = !roomProgress.visitedCorridor;
    };

    const showInvestigation = (target) => {
      if (!investigationOverlay || !target) return;
      if (investigationName) {
        investigationName.textContent = roomProgress.visitedCorridor
          ? '905老头'
          : '老头';
      }
      if (investigationBig && target.big) investigationBig.src = target.big;
      if (investigationInfo) {
        let info = '上了年纪的男性。腿脚不好。一般般友善。';
        if (roomProgress.seenPortrait) {
          info += '可能有个去世不久的老伴。';
        }
        investigationInfo.textContent = info;
      }
      investigationOverlay.hidden = false;
    };

    const showInteractionDialogue = (lines, done) => {
      if (!dialogueBox || !dialogueName || !dialogueText || !lines || !lines.length) {
        if (done) done();
        return;
      }
      dialogueBox.dataset.mode = 'interaction';
      dialogueBox.hidden = false;
      let index = 0;
      let timer = null;
      let completeText = '';
      let complete = false;

      const finishTyping = () => {
        if (!timer) return;
        clearInterval(timer);
        timer = null;
        dialogueText.textContent = completeText;
        complete = true;
        dialogueBox.classList.add('is-complete');
        dialogueBox.classList.remove('is-typing');
      };

      const showLine = () => {
        if (timer) clearInterval(timer);
        timer = null;
        complete = false;
        dialogueBox.classList.remove('is-complete');
        dialogueBox.classList.add('is-typing');
        const raw = String(lines[index] || '');
        const match = raw.match(/^([^：:]+)[：:]([\s\S]*)$/);
        if (match) {
          dialogueName.textContent = match[1].trim();
          dialogueName.hidden = false;
          completeText = match[2];
        } else {
          dialogueName.textContent = '';
          dialogueName.hidden = true;
          completeText = raw;
        }
        dialogueText.textContent = '';
        const delay = (CFG.dialogue && CFG.dialogue.charDelay) || 38;
        let charIndex = 0;
        timer = setInterval(() => {
          charIndex += 1;
          dialogueText.textContent = completeText.slice(0, charIndex);
          if (charIndex >= completeText.length) finishTyping();
        }, delay);
      };

      const cleanup = () => {
        if (timer) clearInterval(timer);
        timer = null;
        dialogueBox.hidden = true;
        delete dialogueBox.dataset.mode;
        dialogueBox.removeEventListener('click', advance);
        window.removeEventListener('keydown', onKey);
        if (activeInteractionDialogueCleanup === cleanup) {
          activeInteractionDialogueCleanup = null;
        }
        interactionLocked = false;
        keys.clear();
        if (done) done();
      };

      const advance = () => {
        if (dialogueBox.hidden || dialogueBox.dataset.mode !== 'interaction') return;
        if (timer) {
          finishTyping();
          return;
        }
        if (!complete) return;
        if (index < lines.length - 1) {
          index += 1;
          showLine();
        } else {
          cleanup();
        }
      };

      const onKey = (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        if (dialogueBox.hidden || dialogueBox.dataset.mode !== 'interaction') return;
        event.preventDefault();
        advance();
      };

      dialogueBox.addEventListener('click', advance);
      window.addEventListener('keydown', onKey);
      activeInteractionDialogueCleanup = cleanup;
      showLine();
    };

    const restoreCharacterBubble = (target) => {
      if (!characterChoiceEl || !target) return;
      characterChoiceEl.hidden = true;
      if (activeInteractionDialogueCleanup) {
        const cleanup = activeInteractionDialogueCleanup;
        activeInteractionDialogueCleanup = null;
        cleanup();
      }
      if (characterChoiceKeyHandler) {
        window.removeEventListener('keydown', characterChoiceKeyHandler);
        characterChoiceKeyHandler = null;
      }
      if (characterActionKeyHandler) {
        window.removeEventListener('keydown', characterActionKeyHandler);
        characterActionKeyHandler = null;
      }
      if (investigationOverlay) investigationOverlay.hidden = true;
      activeCharacterActionTarget = null;
      interactionLocked = false;
      keys.clear();
      activeInteraction = target;
      characterChoiceTarget = null;
      refreshElderName();
      if (interactionBubble && activeInteraction) {
        interactionBubble.style.left = activeInteraction.bubble.left + '%';
        interactionBubble.style.top = activeInteraction.bubble.top + '%';
        interactionBubble.style.transform =
          activeInteraction.bubble.transform || 'none';
        interactionBubble.hidden = false;
      }
    };

    const chooseCharacterAction = (action) => {
      if (!characterChoiceTarget) return;
      const target = characterChoiceTarget;
      if (characterChoiceEl) characterChoiceEl.hidden = true;
      if (characterChoiceKeyHandler) {
        window.removeEventListener('keydown', characterChoiceKeyHandler);
        characterChoiceKeyHandler = null;
      }
      characterChoiceTarget = null;
      const centerX = (target.rect[0] + target.rect[2]) / 2 / 512 * 100;
      const centerY = (target.rect[1] + target.rect[3]) / 2 / 512 * 100;
      const dx = centerX - x;
      const dy = centerY - y;
      setFacing(Math.abs(dx) >= Math.abs(dy)
        ? (dx < 0 ? 'left' : 'right')
        : (dy < 0 ? 'up' : 'down'));
      activeCharacterActionTarget = target;
      characterActionKeyHandler = (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        restoreCharacterBubble(target);
        window.dispatchEvent(new CustomEvent('game:npc-action-cancel', {
          detail: { targetId: target.id }
        }));
      };
      window.addEventListener('keydown', characterActionKeyHandler);
      window.dispatchEvent(new CustomEvent('game:npc-action', {
        detail: { action: action, targetId: target.id }
      }));
      if (action === 'investigate') {
        showInvestigation(target);
      }
      if (action === 'talk') {
        window.removeEventListener('keydown', characterActionKeyHandler);
        characterActionKeyHandler = null;
        showInteractionDialogue(['老头：请回你家，就在对门。'], () => {
          refreshElderName();
        });
      }
    };

    const showCharacterChoice = (target) => {
      if (!characterChoiceEl || !target) return;
      interactionLocked = true;
      keys.clear();
      characterChoiceTarget = target;
      if (interactionBubble) {
        characterChoiceEl.style.left =
          (parseFloat(interactionBubble.style.left) + 3) + '%';
        characterChoiceEl.style.top = interactionBubble.style.top;
        interactionBubble.hidden = true;
      }
      characterChoiceEl.hidden = false;
      characterChoiceKeyHandler = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          restoreCharacterBubble(characterChoiceTarget);
        } else if (event.code === 'KeyW') {
          event.preventDefault();
          chooseCharacterAction('investigate');
        } else if (event.code === 'KeyS') {
          event.preventDefault();
          chooseCharacterAction('talk');
        }
      };
      window.addEventListener('keydown', characterChoiceKeyHandler);
    };

    const startInteraction = (target) => {
      if (!target || interactionLocked) return;
      interactionLocked = true;
      keys.clear();
      activeInteraction = null;
      if (interactionBubble) interactionBubble.hidden = true;
      if (target.id === 'death') {
        roomProgress.seenPortrait = true;
      }
      if (target.kind === 'character') {
        showCharacterChoice(target);
        return;
      }
      if (target.action === 'corridor') {
        roomProgress.visitedCorridor = true;
        refreshElderName();
        const roomScene = document.getElementById('roomScene');
        const corridorScene = document.getElementById('corridorScene');
        if (dialogueBox) dialogueBox.hidden = true;
        if (roomScene) roomScene.hidden = true;
        if (corridorScene) corridorScene.hidden = false;
        const corridorPerson = document.getElementById('corridorPerson');
        if (corridorPerson) {
          corridorPerson.hidden = false;
          beginCorridorPlayerMovement(corridorPerson);
        }
        return;
      }
      if (!target.lines) {
        interactionLocked = false;
        return;
      }
      showInteractionDialogue(target.lines);
    };

    characterChoiceButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (button.dataset.action === 'exit') {
          restoreCharacterBubble(characterChoiceTarget);
        } else {
          chooseCharacterAction(button.dataset.action);
        }
      });
    });

    if (investigationExit) {
      investigationExit.addEventListener('click', (event) => {
        event.stopPropagation();
        if (activeCharacterActionTarget) {
          restoreCharacterBubble(activeCharacterActionTarget);
        }
      });
    }

    const updateObjectInteraction = () => {
      const setDoorHighlights = (closest) => {
        interactions.forEach((interaction) => {
          if (!interaction.targetId) return;
          const door = document.getElementById(interaction.targetId);
          if (door) {
            door.classList.toggle(
              'door-interactable',
              !interactionLocked && closest === interaction
            );
          }
        });
      };
      if (!interactionBubble || interactionLocked) {
        setDoorHighlights(null);
        return;
      }
      const footX = x / 100 * 512;
      const footY = (y + halfHeight) / 100 * 512;
      let closestCharacter = null;
      let closestDoor = null;
      let closestOther = null;
      let characterDistance = Infinity;
      let doorDistance = Infinity;
      let otherDistance = Infinity;
      interactions.forEach((interaction) => {
        const rect = interaction.rect || [0, 0, 0, 0];
        const nearX = Math.max(rect[0], Math.min(footX, rect[2]));
        const nearY = Math.max(rect[1], Math.min(footY, rect[3]));
        const distance = Math.hypot(footX - nearX, footY - nearY);
        if (distance > interactionRadius) return;
        if (interaction.kind === 'character' && distance < characterDistance) {
          closestCharacter = interaction;
          characterDistance = distance;
        } else if (interaction.kind === 'door' && distance < doorDistance) {
          closestDoor = interaction;
          doorDistance = distance;
        } else if (!interaction.kind && distance < otherDistance) {
          closestOther = interaction;
          otherDistance = distance;
        }
      });
      const closest = closestCharacter || closestDoor || closestOther;
      if (!closest) {
        setDoorHighlights(null);
        activeInteraction = null;
        interactionBubble.hidden = true;
        return;
      }
      setDoorHighlights(closest);
      activeInteraction = closest;
      interactionBubble.hidden = false;
      interactionBubble.style.left = closest.bubble.left + '%';
      interactionBubble.style.top = closest.bubble.top + '%';
      interactionBubble.style.transform = closest.bubble.transform || 'none';
    };

    const canStandAt = (nextX, nextY) => {
      const foot = { x: nextX, y: nextY + halfHeight };
      return !bounds.length || pointInPolygon(foot, bounds);
    };

    if (interactionBubble) {
      interactionBubble.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!interactionBubble.hidden) startInteraction(activeInteraction);
      });
    }

    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyE') {
        if (interactionBubble && !interactionBubble.hidden && !interactionLocked) {
          event.preventDefault();
          event.stopImmediatePropagation();
          startInteraction(activeInteraction);
        }
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
      ].indexOf(event.code) < 0) return;
      event.preventDefault();
      if (interactionLocked) return;
      keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
      ].indexOf(event.code) < 0) return;
      event.preventDefault();
      keys.delete(event.code);
    });
    window.addEventListener('room:return', (event) => {
      const detail = event.detail || {};
      x = isFinite(detail.x) ? detail.x : 72.85;
      y = isFinite(detail.y) ? detail.y : 20.54;
      person.style.left = x + '%';
      person.style.top = y + '%';
      interactionLocked = false;
      keys.clear();
      activeInteraction = null;
      if (interactionBubble) interactionBubble.hidden = true;
      setFacing(detail.facing || 'down');
      updateRoomCharacterDepth();
      refreshElderName();
    });

    let lastTime = performance.now();
    setInterval(() => {
      const now = performance.now();
      const dt = Math.min(.05, (now - lastTime) / 1000);
      lastTime = now;
      if (interactionLocked) {
        keys.clear();
        return;
      }
      let moveX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      let moveY = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      if (!moveX && !moveY) {
        updateObjectInteraction();
        return;
      }
      const length = Math.hypot(moveX, moveY) || 1;
      moveX = moveX / length * speed * dt;
      moveY = moveY / length * speed * dt;

      let appliedX = 0;
      let appliedY = 0;
      if (canStandAt(x + moveX, y + moveY)) {
        appliedX = moveX;
        appliedY = moveY;
      } else if (canStandAt(x + moveX, y)) {
        appliedX = moveX;
      } else if (canStandAt(x, y + moveY)) {
        appliedY = moveY;
      }
      if (appliedX || appliedY) {
        x += appliedX;
        y += appliedY;
        person.style.left = x + '%';
        person.style.top = y + '%';
        updateRoomCharacterDepth();
        setFacing(Math.abs(appliedX) >= Math.abs(appliedY)
          ? (appliedX < 0 ? 'left' : 'right')
          : (appliedY < 0 ? 'up' : 'down'));
      }
      updateObjectInteraction();
    }, 16);
  }

  function beginCorridorPlayerMovement(person) {
    if (!person) return;
    if (person.dataset.movementEnabled === 'true') {
      window.dispatchEvent(new CustomEvent('corridor:resume'));
      return;
    }
    person.dataset.movementEnabled = 'true';
    const M = CFG.corridorMovement || {};
    const bounds = (M.bounds || []).map((point) => ({
      x: point[0],
      y: point[1]
    }));
    const areas = [bounds].concat((M.extraAreas || []).map((area) =>
      area.map((point) => ({ x: point[0], y: point[1] }))
    )).filter((area) => area.length);
    const speed = M.speedPctPerSecond || 15;
    const halfHeight = 16.065 / 2;
    const keys = new Set();
    let x = parseFloat(person.style.left);
    let y = parseFloat(person.style.top);
    if (!isFinite(x)) x = 23.44;
    if (!isFinite(y)) y = 58.89;
    person.style.left = x + '%';
    person.style.top = y + '%';
    let facing = 'right';

    const setFacing = (direction) => {
      if (direction === facing) return;
      facing = direction;
      if (direction === 'up') {
        person.src = 'assets/P_back.png';
        person.style.transform = 'translate(-50%, -50%)';
      } else if (direction === 'down') {
        person.src = 'assets/P.png';
        person.style.transform = 'translate(-50%, -50%)';
      } else if (direction === 'left') {
        person.src = 'assets/P_side.png';
        person.style.transform = 'translate(-50%, -50%) scaleX(-1)';
      } else {
        person.src = 'assets/P_side.png';
        person.style.transform = 'translate(-50%, -50%)';
      }
    };

    const canStandAt = (nextX, nextY) => {
      const foot = { x: nextX, y: nextY + halfHeight };
      return !areas.length || areas.some((area) => pointInPolygon(foot, area));
    };

    const doorInteractions = CFG.corridorInteractions || [];
    const doorBubble = document.getElementById('corridorInteractionBubble');
    const corridorDialogue = document.getElementById('corridorDialogue');
    const corridorDialogueName = document.getElementById('corridorDialogueName');
    const corridorDialogueText = document.getElementById('corridorDialogueText');
    let activeDoor = null;
    let doorLocked = false;
    const updateCorridorDoorHighlight = () => {
      if (doorLocked) {
        doorInteractions.forEach((door) => {
          const element = document.getElementById(door.id);
          if (element) {
            element.classList.remove('door-interactable');
            element.classList.remove('is-touched');
          }
        });
        if (doorBubble) doorBubble.hidden = true;
        activeDoor = null;
        return;
      }
      const footX = x;
      const footY = y + halfHeight;
      let closest = null;
      let closestDistance = Infinity;
      doorInteractions.forEach((door) => {
        const rect = door.rect;
        const nearX = Math.max(rect[0], Math.min(footX, rect[2]));
        const nearY = Math.max(rect[1], Math.min(footY, rect[3]));
        const distance = Math.hypot(footX - nearX, footY - nearY);
        if (distance <= .9 && distance < closestDistance) {
          closest = door;
          closestDistance = distance;
        }
      });
      const previousId = activeDoor ? activeDoor.id : null;
      const nextId = closest ? closest.id : null;
      if (previousId !== nextId) {
        if (previousId) {
          const previous = document.getElementById(previousId);
          if (previous) {
            previous.classList.remove('door-interactable');
            previous.classList.remove('is-touched');
          }
        }
        if (nextId) {
          const current = document.getElementById(nextId);
          if (current) {
            current.classList.add('door-interactable');
            current.classList.add('is-touched');
          }
        }
        activeDoor = closest;
      }
      if (!doorBubble) return;
      if (!activeDoor) {
        doorBubble.hidden = true;
        return;
      }
      doorBubble.hidden = false;
      doorBubble.style.left = activeDoor.bubble.left + '%';
      doorBubble.style.top = activeDoor.bubble.top + '%';
      doorBubble.style.transform = activeDoor.bubble.transform || 'none';
    };

    const showCorridorDoorMessage = (messageLines, done) => {
      const lines = Array.isArray(messageLines) ? messageLines : [String(messageLines)];
      if (!corridorDialogue || !corridorDialogueText || !lines.length) {
        doorLocked = false;
        if (done) done();
        return;
      }
      doorLocked = true;
      keys.clear();
      if (doorBubble) doorBubble.hidden = true;
      if (corridorDialogueName) corridorDialogueName.hidden = true;
      corridorDialogue.hidden = false;
      corridorDialogueText.textContent = '';
      let index = 0;
      let timer = null;
      let completeText = '';
      let complete = false;
      const finishTyping = () => {
        if (!timer) return;
        clearInterval(timer);
        timer = null;
        corridorDialogueText.textContent = completeText;
        complete = true;
      };
      const showLine = () => {
        if (timer) clearInterval(timer);
        timer = null;
        complete = false;
        const raw = String(lines[index] || '');
        const match = raw.match(/^([^：:]+)[：:]([\s\S]*)$/);
        if (match && corridorDialogueName) {
          corridorDialogueName.textContent = match[1].trim();
          corridorDialogueName.hidden = false;
          completeText = match[2];
        } else {
          if (corridorDialogueName) {
            corridorDialogueName.textContent = '';
            corridorDialogueName.hidden = true;
          }
          completeText = raw;
        }
        corridorDialogueText.textContent = '';
        let charIndex = 0;
        const delay = (CFG.dialogue && CFG.dialogue.charDelay) || 38;
        timer = setInterval(() => {
          charIndex += 1;
          corridorDialogueText.textContent = completeText.slice(0, charIndex);
          if (charIndex >= completeText.length) finishTyping();
        }, delay);
      };
      const advance = (event) => {
        if (event) event.preventDefault();
        if (timer) {
          finishTyping();
          return;
        }
        if (!complete) return;
        if (index < lines.length - 1) {
          index += 1;
          showLine();
          return;
        }
        corridorDialogue.hidden = true;
        corridorDialogue.removeEventListener('click', advance);
        window.removeEventListener('keydown', onKey);
        doorLocked = false;
        keys.clear();
        updateCorridorDoorHighlight();
        if (done) done();
      };
      const onKey = (event) => {
        if (event.key === ' ' || event.key === 'Enter') advance(event);
      };
      corridorDialogue.addEventListener('click', advance);
      window.addEventListener('keydown', onKey);
      showLine();
    };

    const returnTo905Door = () => {
      doorLocked = true;
      if (doorBubble) doorBubble.hidden = true;
      if (corridorDialogue) corridorDialogue.hidden = true;
      const corridorScene = document.getElementById('corridorScene');
      const roomScene = document.getElementById('roomScene');
      if (corridorScene) corridorScene.hidden = true;
      if (roomScene) roomScene.hidden = false;
      person.hidden = true;
      const roomPerson = document.getElementById('roomPerson');
      if (roomPerson) {
        roomPerson.src = 'assets/P_side.png';
        roomPerson.style.transform = 'translate(-50%, -50%)';
        roomPerson.dataset.standing = 'true';
        beginRoomPlayerMovement(roomPerson);
      }
      window.dispatchEvent(new CustomEvent('room:return', {
        detail: { x: 72.85, y: 20.54, facing: 'down' }
      }));
    };

    const startCorridorDoorInteraction = (door) => {
      if (!door || doorLocked) return;
      if (door.action === 'enter-hq1') {
        doorLocked = true;
        if (doorBubble) doorBubble.hidden = true;
        if (corridorDialogue) corridorDialogue.hidden = true;
        enterHqBase();
        return;
      }
      if (door.action === 'return-905') {
        returnTo905Door();
        return;
      }
      if (door.action === 'visit-901') {
        showCorridorDoorMessage(['（还是先去一次901吧）']);
        return;
      }
      if (door.action === 'zone-wait') {
        showCorridorDoorMessage([
          '现在还不是上下楼的时候。',
          '先去一次901吧。'
        ]);
        return;
      }
      window.dispatchEvent(new CustomEvent('game:corridor-door', {
        detail: { id: door.id, action: door.action || 'none' }
      }));
    };

    window.addEventListener('corridor:resume', (event) => {
      const detail = event.detail || {};
      x = isFinite(detail.x) ? detail.x : 23.44;
      y = isFinite(detail.y) ? detail.y : 58.89;
      person.style.left = x + '%';
      person.style.top = y + '%';
      facing = 'reset';
      setFacing(detail.facing || 'right');
      doorLocked = false;
      keys.clear();
      activeDoor = null;
      if (doorBubble) doorBubble.hidden = true;
      if (corridorDialogue) corridorDialogue.hidden = true;
      person.hidden = false;
      updateCorridorDoorHighlight();
    });

    if (doorBubble) {
      doorBubble.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!doorBubble.hidden && !doorLocked) {
          startCorridorDoorInteraction(activeDoor);
        }
      });
    }

    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyE') {
        if (doorBubble && !doorBubble.hidden && !doorLocked) {
          event.preventDefault();
          event.stopImmediatePropagation();
          startCorridorDoorInteraction(activeDoor);
        }
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
      ].indexOf(event.code) < 0) return;
      event.preventDefault();
      if (doorLocked) return;
      keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
      ].indexOf(event.code) < 0) return;
      event.preventDefault();
      keys.delete(event.code);
    });

    let lastTime = performance.now();
    setInterval(() => {
      const now = performance.now();
      const dt = Math.min(.05, (now - lastTime) / 1000);
      lastTime = now;
      updateCorridorDoorHighlight();
      if (doorLocked) {
        keys.clear();
        return;
      }
      let moveX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      let moveY = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      if (!moveX && !moveY) return;
      const length = Math.hypot(moveX, moveY) || 1;
      moveX = moveX / length * speed * dt;
      moveY = moveY / length * speed * dt;
      let appliedX = 0;
      let appliedY = 0;
      if (canStandAt(x + moveX, y + moveY)) {
        appliedX = moveX;
        appliedY = moveY;
      } else if (canStandAt(x + moveX, y)) {
        appliedX = moveX;
      } else if (canStandAt(x, y + moveY)) {
        appliedY = moveY;
      }
      if (!appliedX && !appliedY) return;
      x += appliedX;
      y += appliedY;
      person.style.left = x + '%';
      person.style.top = y + '%';
      setFacing(Math.abs(appliedX) >= Math.abs(appliedY)
        ? (appliedX < 0 ? 'left' : 'right')
        : (appliedY < 0 ? 'up' : 'down'));
      updateCorridorDoorHighlight();
    }, 16);
  }

  function updateRoomCharacterDepth() {
    const canvas = document.querySelector('.room-canvas');
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    document.querySelectorAll('[data-room-character]').forEach((character) => {
      const rect = character.getBoundingClientRect();
      const footY = rect.bottom - canvasRect.top;
      character.style.zIndex = String(100 + Math.round(footY));
    });
  }

  function startRoomPlot(box, nameEl, textEl, onFirstAdvance) {
    const lines = CFG.plot0 || [];
    if (!box || !nameEl || !textEl || !lines.length) return;
    box.dataset.mode = 'plot';
    let index = 0;
    let timer = null;
    let completeText = '';
    let complete = false;
    let firstTransitioning = false;

    const finishTyping = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      textEl.textContent = completeText;
      complete = true;
      box.classList.add('is-complete');
      box.classList.remove('is-typing');
      const paper = document.getElementById('roomPaper');
      if (index === 11 && paper) paper.hidden = false;
    };

    const showLine = () => {
      if (timer) clearInterval(timer);
      timer = null;
      complete = false;
      box.classList.remove('is-complete');
      box.classList.add('is-typing');
      const raw = String(lines[index] || '');
      const match = raw.match(/^([^：:]+)[：:]([\s\S]*)$/);
      if (match) {
        nameEl.textContent = match[1].trim();
        nameEl.hidden = false;
        completeText = match[2];
      } else {
        nameEl.textContent = '';
        nameEl.hidden = true;
        completeText = raw;
      }
      textEl.textContent = '';
      const delay = (CFG.dialogue && CFG.dialogue.charDelay) || 38;
      let charIndex = 0;
      timer = setInterval(() => {
        charIndex += 1;
        textEl.textContent = completeText.slice(0, charIndex);
        if (charIndex >= completeText.length) finishTyping();
      }, delay);
    };

    const advance = () => {
      if (!box || box.hidden || box.dataset.mode !== 'plot') return;
      if (timer) {
        finishTyping();
        return;
      }
      const paper = document.getElementById('roomPaper');
      if (paper && !paper.hidden) return;
      if (!complete || firstTransitioning) return;
      if (index >= lines.length - 1) {
        box.hidden = true;
        delete box.dataset.mode;
        beginRoomPlayerMovement(document.getElementById('roomPerson'));
        return;
      }
      if (index === 0 && typeof onFirstAdvance === 'function') {
        firstTransitioning = true;
        Promise.resolve(onFirstAdvance()).then(() => {
          firstTransitioning = false;
          index += 1;
          showLine();
        });
        return;
      }
      index += 1;
      showLine();
    };

    box.addEventListener('click', advance);
    const paper = document.getElementById('roomPaper');
    if (paper) {
      paper.addEventListener('click', (event) => {
        event.stopPropagation();
        if (box.dataset.mode !== 'plot' ||
            paper.hidden || index !== 11 || !complete) return;
        paper.hidden = true;
        index += 1;
        showLine();
      });
    }
    window.addEventListener('keydown', (event) => {
      if (box.hidden || box.dataset.mode !== 'plot') return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        advance();
      }
    });
    showLine();
  }

  window.RoomStory = {
    init(options) {
      stage = options.stage;
      startPrologue = options.onStartPrologue;
      window.addEventListener('keydown', blockEscapeDuringDialogue, true);
      initGameCover();
    }
  };
})();
