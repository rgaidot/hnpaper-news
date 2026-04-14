const markdownEl = document.getElementById("markdown");
const btnGenerate = document.getElementById("btn-generate");
const btnText = document.getElementById("btn-text");
const btnSpinner = document.getElementById("btn-spinner");
const btnIcon = document.getElementById("btn-icon");
const statusEl = document.getElementById("status");
const resultSection = document.getElementById("result-section");
const audioPlayer = document.getElementById("audio-player");
const vttPreview = document.getElementById("vtt-preview");
const downloadMp3 = document.getElementById("download-mp3");
const downloadVtt = document.getElementById("download-vtt");

let currentVttText = "";
let currentCues = [];

function parseTime(timeStr) {
  const parts = timeStr.split(":");
  let secs = 0;
  if (parts.length === 3) {
    secs += parseInt(parts[0], 10) * 3600;
    secs += parseInt(parts[1], 10) * 60;
    secs += parseFloat(parts[2]);
  }
  return secs;
}

function renderVttAndSetupHighlighting(vttText) {
  currentVttText = vttText;
  currentCues = [];

  const blocks = vttText.trim().split(/\n\n+/);
  let html = "";

  blocks.forEach((block, index) => {
    if (index === 0 && block.startsWith("WEBVTT")) {
      html += block + "\n\n";
      return;
    }

    const lines = block.split("\n");
    if (lines.length >= 3) {
      const timeMatch = lines[1].match(
        /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/,
      );
      if (timeMatch) {
        const start = parseTime(timeMatch[1]);
        const end = parseTime(timeMatch[2]);
        currentCues.push({ id: `cue-${index}`, start, end });

        html += `<span id="cue-${index}" class="inline-block w-full border-l-2 border-transparent pl-2 py-0.5 rounded-r-md">${block}</span>\n\n`;
        return;
      }
    }
    html += block + "\n\n";
  });

  vttPreview.innerHTML = html;
}

audioPlayer.addEventListener("timeupdate", () => {
  if (!currentCues.length) return;

  const currentTime = audioPlayer.currentTime;
  let activeCueId = null;

  for (const cue of currentCues) {
    if (currentTime >= cue.start && currentTime <= cue.end) {
      activeCueId = cue.id;
      break;
    }
  }

  currentCues.forEach((cue) => {
    const el = document.getElementById(cue.id);
    if (el) {
      if (cue.id === activeCueId) {
        el.classList.add("text-white", "bg-indigo-500/20", "border-indigo-400");
        el.classList.remove("border-transparent");

        const container = vttPreview;
        const offsetTop = el.offsetTop - container.offsetTop;

        if (
          offsetTop < container.scrollTop ||
          offsetTop > container.scrollTop + container.clientHeight - 60
        ) {
          container.scrollTo({
            top: Math.max(0, offsetTop - 40),
            behavior: "smooth",
          });
        }
      } else {
        el.classList.remove(
          "text-white",
          "bg-indigo-500/20",
          "border-indigo-400",
        );
        el.classList.add("border-transparent");
      }
    }
  });
});

function updateButtonState() {
  const hasText = markdownEl.value.trim().length > 0;
  btnGenerate.disabled = !hasText;
}

function clearText() {
  markdownEl.value = "";
  updateButtonState();
  hideResult();
}

let resultTimeout;

function showResult() {
  clearTimeout(resultTimeout);
  resultSection.classList.remove("hidden");
  setTimeout(() => {
    resultSection.classList.remove("opacity-0", "translate-y-8");
    resultSection.classList.add("opacity-100", "translate-y-0");
  }, 10);
}

function hideResult() {
  clearTimeout(resultTimeout);
  resultSection.classList.add("opacity-0", "translate-y-8");
  resultSection.classList.remove("opacity-100", "translate-y-0");
  resultTimeout = setTimeout(() => {
    resultSection.classList.add("hidden");
  }, 500);
}

async function generateTTS() {
  const markdown = markdownEl.value.trim();
  if (!markdown) {
    statusEl.textContent = "⚠️ Please enter some text.";
    statusEl.classList.replace("text-slate-500", "text-amber-500");
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.classList.replace("text-amber-500", "text-slate-500");
    }, 3000);
    return;
  }

  btnGenerate.disabled = true;
  btnText.textContent = "Generating...";
  btnSpinner.classList.remove("hidden");
  btnIcon.classList.add("hidden");

  statusEl.textContent = "Synthesis in progress...";
  statusEl.className = "text-sm font-medium text-indigo-500";

  hideResult();

  try {
    const response = await fetch("/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown }),
    });

    if (!response.ok) throw new Error(`Error ${response.status}`);

    const data = await response.json();

    const audioBlob = b64toBlob(data.audio_base64, "audio/mpeg");
    const audioUrl = URL.createObjectURL(audioBlob);
    audioPlayer.src = audioUrl;

    const dateStr = new Date().toISOString().slice(0, 10);
    downloadMp3.href = audioUrl;
    downloadMp3.download = `${dateStr}.mp3`;

    const vttBlob = new Blob([data.vtt], { type: "text/vtt" });
    const vttUrl = URL.createObjectURL(vttBlob);
    downloadVtt.href = vttUrl;
    downloadVtt.download = `${dateStr}.vtt`;
    renderVttAndSetupHighlighting(data.vtt);

    showResult();
    statusEl.textContent = "✓ Completed successfully";
    statusEl.className = "text-sm font-medium text-emerald-500";
  } catch (error) {
    console.error(error);
    statusEl.textContent = error.message.includes("fetch") 
      ? "Error: Server unreachable" 
      : error.message;
    statusEl.className = "text-sm font-medium text-red-500";
  } finally {
    btnGenerate.disabled = false;
    btnText.textContent = "Generate";
    btnSpinner.classList.add("hidden");
    btnIcon.classList.remove("hidden");

    setTimeout(() => {
      if (statusEl.classList.contains("text-emerald-500")) {
        statusEl.textContent = "";
        statusEl.className =
          "text-sm font-medium text-slate-500 h-5 w-full sm:w-auto text-center sm:text-left transition-colors duration-300";
      }
    }, 4000);
  }
}

function b64toBlob(b64Data, contentType = "", sliceSize = 512) {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  return new Blob(byteArrays, { type: contentType });
}
