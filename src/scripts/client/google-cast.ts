export interface CastMediaOptions {
  castSession: any;
  audioUrl: string;
  vttUrl?: string;
  title: string;
  artist?: string;
  imageUrl?: string;
}

export function loadCastMedia(options: CastMediaOptions): Promise<void> {
  const { castSession, audioUrl, vttUrl, title, artist, imageUrl } = options;
  const chrome = (window as any).chrome;

  if (!chrome || !castSession) {
    return Promise.reject("Cast session or API not available");
  }

  const mediaInfo = new chrome.cast.media.MediaInfo(audioUrl, "audio/mpeg");
  mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;

  mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
  mediaInfo.metadata.title = title;
  mediaInfo.metadata.artist = artist || "HNPaper News";
  if (imageUrl) {
    mediaInfo.metadata.images = [new chrome.cast.Image(imageUrl)];
  }

  if (vttUrl) {
    const track = new chrome.cast.media.Track(
      1,
      chrome.cast.media.TrackType.TEXT,
    );
    track.trackContentId = vttUrl;
    track.trackContentType = "text/vtt";
    track.subtype = chrome.cast.media.TextTrackType.SUBTITLES;
    track.name = "Français";
    track.language = "fr-FR";
    track.customData = null;

    mediaInfo.tracks = [track];
  }

  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  if (vttUrl) {
    request.activeTrackIds = [1];
  }

  return new Promise((resolve, reject) => {
    castSession.loadMedia(request).then(
      () => resolve(),
      (errorCode: any) => reject(errorCode),
    );
  });
}
