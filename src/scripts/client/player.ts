import { loadCastMedia } from "./google-cast";

export function initPlayer() {
  const container = document.getElementById("player-container");
  if (!container) return;

  const title = container.dataset.title || "";
  const slug = container.dataset.slug || "";
  const audio = document.getElementById("audio-player") as HTMLAudioElement;
  const castBtn = document.getElementById("cast-button");

  let castContext: any = null;
  let castSession: any = null;
  let remotePlayer: any = null;
  let remotePlayerController: any = null;

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: "HNPaper News",
      album: "Actualités Tech",
      artwork: [
        {
          src: "/player-background.png",
          sizes: "1920x1080",
          type: "image/png",
        },
        { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
      ],
    });

    navigator.mediaSession.setActionHandler("play", () => {
      if (castSession) {
        remotePlayerController.playOrPause();
      } else {
        audio.play();
      }
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      if (castSession) {
        remotePlayerController.playOrPause();
      } else {
        audio.pause();
      }
    });
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      if (castSession) {
        remotePlayer.currentTime = Math.max(
          remotePlayer.currentTime - (details.seekOffset || 10),
          0,
        );
        remotePlayerController.seek();
      } else {
        audio.currentTime = Math.max(
          audio.currentTime - (details.seekOffset || 10),
          0,
        );
      }
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      if (castSession) {
        remotePlayer.currentTime =
          remotePlayer.currentTime + (details.seekOffset || 10);
        remotePlayerController.seek();
      } else {
        audio.currentTime = Math.min(
          audio.currentTime + (details.seekOffset || 10),
          audio.duration,
        );
      }
    });
    navigator.mediaSession.setActionHandler("stop", () => {
      if (castSession) {
        remotePlayerController.stop();
      } else {
        audio.pause();
        audio.currentTime = 0;
      }
    });
  }

  window.addEventListener("google-cast-available", () => {
    initializeCast();
  });

  if ((window as any).cast && (window as any).cast.framework) {
    initializeCast();
  }

  function initializeCast() {
    const cast = (window as any).cast;
    const chrome = (window as any).chrome;

    if (!cast || !cast.framework || castContext) return;

    castContext = cast.framework.CastContext.getInstance();
    castContext.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });

    if (castBtn) {
      castBtn.classList.remove("hidden");
      castBtn.innerHTML = `
          <svg style="width:24px;height:24px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M1,18L1,21L4,21C4,19.34 2.66,18 1,18M1,14L1,16C3.76,16 6,18.24 6,21L8,21C8,17.13 4.87,14 1,14M1,10L1,12C5.97,12 10,16.03 10,21L12,21C12,14.92 7.07,10 1,10M21,3L3,3C1.9,3 1,3.9 1,5L1,8L3,8L3,5L21,5L21,19L14,19L14,21L21,21C22.1,21 23,20.1 23,19L23,5C23,3.9 22.1,3 21,3Z" />
          </svg>
        `;

      castBtn.addEventListener("click", () => {
        castContext.requestSession();
      });
    }

    remotePlayer = new cast.framework.RemotePlayer();
    remotePlayerController = new cast.framework.RemotePlayerController(
      remotePlayer,
    );

    remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
      () => {
        if (remotePlayer.isConnected) {
          console.log("Cast Connected");
          castSession = castContext.getCurrentSession();
          if (castBtn) castBtn.classList.add("text-blue-500");

          audio.pause();

          loadRemoteMedia();
        } else {
          console.log("Cast Disconnected");
          castSession = null;
          if (castBtn) castBtn.classList.remove("text-blue-500");
        }
      },
    );

    remotePlayerController.addEventListener(
      cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
      () => {
        if (remotePlayer.isConnected && "mediaSession" in navigator) {
          const playerState = remotePlayer.playerState;
          if (playerState === chrome.cast.media.PlayerState.PLAYING) {
            navigator.mediaSession.playbackState = "playing";
          } else if (playerState === chrome.cast.media.PlayerState.PAUSED) {
            navigator.mediaSession.playbackState = "paused";
          }
        }
      },
    );
  }

  function loadRemoteMedia() {
    if (!castSession) return;

    const audioUrl = `${window.location.origin}/audio/${slug}.mp3`;
    const vttUrl = `${window.location.origin}/audio/${slug}.vtt`;

    loadCastMedia({
      castSession,
      audioUrl,
      vttUrl,
      title,
      artist: "HNPaper News",
      imageUrl: `${window.location.origin}/player-background.png`,
    }).then(
      () => console.log("Load succeed"),
      (errorCode) => console.log("Error code: " + errorCode),
    );
  }
}
