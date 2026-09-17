import type { ExtensionMessage } from '../shared/messages';

console.log('[ExtensionX] Telegram Web Content Script loaded.');

// Utility to create the SVG icon
function createDownloadIcon(): SVGSVGElement {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z');
  svg.appendChild(path);
  return svg;
}

// Function to handle the download click
async function handleDownloadClick(e: MouseEvent, mediaElement: HTMLElement, isVideo: boolean) {
  e.preventDefault();
  e.stopPropagation();
  
  let url = '';
  
  if (mediaElement instanceof HTMLImageElement) {
    url = mediaElement.src;
  } else if (mediaElement instanceof HTMLVideoElement) {
    url = mediaElement.src;
  }
  
  if (url) {
     console.log('[ExtensionX] Downloading media:', url);
     try {
       const message: ExtensionMessage = {
         type: 'TG_DOWNLOAD_MEDIA',
         payload: {
           url: url,
           filename: isVideo ? `tg_video_${Date.now()}.mp4` : `tg_image_${Date.now()}.jpg`,
           isVideo: isVideo
         }
       };
       chrome.runtime.sendMessage(message);
       
       const btn = e.currentTarget as HTMLButtonElement;
       const originalBg = btn.style.backgroundColor;
       btn.style.backgroundColor = 'green';
       setTimeout(() => {
         btn.style.backgroundColor = originalBg;
       }, 1000);
     } catch (err) {
       console.error('[ExtensionX] Failed to send download message', err);
     }
  } else if (mediaElement instanceof HTMLCanvasElement) {
     const dataUrl = mediaElement.toDataURL('image/jpeg', 0.95);
     const message: ExtensionMessage = {
         type: 'TG_DOWNLOAD_MEDIA',
         payload: {
           url: dataUrl,
           filename: `tg_image_${Date.now()}.jpg`,
           isVideo: false
         }
     };
     chrome.runtime.sendMessage(message);
  } else {
     console.error('[ExtensionX] Could not determine media URL');
  }
}

function attachButtonToMedia(container: HTMLElement, mediaElement: HTMLElement, isVideo: boolean) {
  if (container.querySelector('.ext-x-tg-download-btn')) {
    return; // Already attached
  }
  
  container.classList.add('ext-x-tg-media-wrapper');
  
  const btn = document.createElement('button');
  btn.className = 'ext-x-tg-download-btn';
  btn.title = 'Tải xuống (X Media Downloader)';
  btn.appendChild(createDownloadIcon());
  
  btn.addEventListener('click', (e) => handleDownloadClick(e, mediaElement, isVideo));
  
  container.appendChild(btn);
}

function processDOM() {
  // 1. Find videos
  const videos = document.querySelectorAll('video');
  videos.forEach((video) => {
    const parent = video.parentElement;
    if (parent && !parent.querySelector('.ext-x-tg-download-btn')) {
       attachButtonToMedia(parent, video, true);
    }
  });
  
  // 2. Find images
  const images = document.querySelectorAll('img.media-photo, .message-media img, .media-viewer-aspecter img');
  images.forEach((img) => {
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.ext-x-tg-download-btn')) {
       attachButtonToMedia(parent, img as HTMLElement, false);
    }
  });
  
  // 3. Canvas (WebA sometimes uses canvas for images)
  const canvases = document.querySelectorAll('.message-media canvas');
  canvases.forEach((canvas) => {
    const parent = canvas.parentElement;
    if (parent && !parent.querySelector('.ext-x-tg-download-btn')) {
       attachButtonToMedia(parent, canvas as HTMLElement, false);
    }
  });
}

const observer = new MutationObserver((mutations) => {
  let shouldProcess = false;
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      shouldProcess = true;
      break;
    }
  }
  if (shouldProcess) {
    processDOM();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

setTimeout(processDOM, 1000);
