import { formatBytes, getFileIcon } from './modules/utils.js';
import { fetchTransferMetadata, unlockTransfer } from './modules/api.js';

// Global State
let transferId = null;
let sharedPassword = ''; // Cached password for subsequent downloads

// DOM Views
const loadingView = document.getElementById('loading-view');
const lockedView = document.getElementById('locked-view');
const unlockedView = document.getElementById('unlocked-view');
const errorView = document.getElementById('error-view');

// DOM Elements
const unlockForm = document.getElementById('unlock-form');
const unlockPasswordInput = document.getElementById('unlock-password');
const unlockError = document.getElementById('unlock-error');
const transferTitle = document.getElementById('transfer-title');
const transferDate = document.getElementById('transfer-date');
const transferExpiryBadge = document.getElementById('transfer-expiry-badge');
const textContentSection = document.getElementById('text-content-section');
const textPreview = document.getElementById('text-preview');
const filesSection = document.getElementById('files-section');
const filesCountSpan = document.getElementById('files-count');
const downloadList = document.getElementById('download-list');
const btnDownloadAll = document.getElementById('btn-download-all');

const errorViewTitle = document.getElementById('error-view-title');
const errorViewText = document.getElementById('error-view-text');
const errorViewIcon = document.getElementById('error-view-icon');

document.addEventListener('DOMContentLoaded', () => {
  // Parse ID/slug from URL path (/link/slug-name)
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  transferId = pathParts[pathParts.length - 1];

  if (!transferId || transferId.trim() === '') {
    showErrorView('Identifiant manquant', 'Le lien de partage est invalide ou incomplet. Veuillez vérifier le lien fourni.');
    return;
  }

  // Fetch initial transfer details
  loadTransferDetails();

  // Unlock password form submit listener
  unlockForm.addEventListener('submit', (e) => {
    e.preventDefault();
    unlockError.style.display = 'none';
    const pwd = unlockPasswordInput.value;
    unlock(pwd);
  });

  // Download all files listener
  btnDownloadAll.addEventListener('click', downloadAllFiles);

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  }
});

// Fetch Transfer Details (Initial check)
async function loadTransferDetails() {
  try {
    const data = await fetchTransferMetadata(transferId);
    
    // Hide loading screen
    loadingView.style.display = 'none';

    switch (data.status) {
      case 'pending':
        const startDateStr = new Date(data.startDate).toLocaleString('fr-FR');
        showErrorView(
          'Transfert non actif',
          `Ce transfert est planifié. Il sera disponible à partir du ${startDateStr}.`,
          'fa-clock',
          'var(--color-warning)'
        );
        break;

      case 'expired':
        const endDateStr = new Date(data.endDate).toLocaleString('fr-FR');
        showErrorView(
          'Transfert expiré',
          `Ce transfert a expiré le ${endDateStr} et n'est plus accessible.`,
          'fa-circle-xmark',
          'var(--color-danger)'
        );
        break;

      case 'locked':
        lockedView.style.display = 'flex';
        document.getElementById('locked-title').innerText = data.title;
        unlockPasswordInput.focus();
        break;

      case 'unlocked':
        renderUnlockedContent(data);
        break;

      default:
        showErrorView('Erreur d\'accès', 'Le statut du transfert est inconnu.');
    }
  } catch (err) {
    loadingView.style.display = 'none';
    showErrorView('Erreur', err.message || 'Impossible de charger les métadonnées.');
  }
}

// Unlock Transfer using password
async function unlock(password) {
  const btnUnlock = document.getElementById('btn-unlock');
  btnUnlock.disabled = true;
  btnUnlock.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Déverrouillage...';

  try {
    const data = await unlockTransfer(transferId, password);
    sharedPassword = password;
    
    // Smooth transition from lock screen to content
    lockedView.style.display = 'none';
    
    // Fetch and display full payload
    const meta = await fetchTransferMetadata(transferId);
    const fullPayload = {
      ...meta,
      textContent: data.textContent,
      files: data.files
    };
    
    renderUnlockedContent(fullPayload);
  } catch (err) {
    btnUnlock.disabled = false;
    btnUnlock.innerHTML = '<i class="fa-solid fa-lock-open"></i> Déverrouiller le transfert';
    unlockError.style.display = 'flex';
    unlockError.querySelector('span').innerText = err.message;
    unlockPasswordInput.value = '';
    unlockPasswordInput.focus();
  }
}

// Render Content (Files, Text & Expiry metrics)
function renderUnlockedContent(transfer) {
  unlockedView.style.display = 'flex';
  
  // Set headers
  transferTitle.innerText = transfer.title;
  transferDate.innerText = new Date(transfer.createdAt).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  // Calculate and render expiry banner
  if (transfer.endDate) {
    const end = new Date(transfer.endDate);
    const now = new Date();
    const diffHours = Math.round((end - now) / (1000 * 60 * 60));
    
    if (diffHours <= 24) {
      transferExpiryBadge.className = 'status-badge status-expired';
      transferExpiryBadge.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> Expire dans ${diffHours} h`;
    } else {
      const diffDays = Math.round(diffHours / 24);
      transferExpiryBadge.className = 'status-badge status-pending';
      transferExpiryBadge.innerHTML = `<i class="fa-solid fa-hourglass-end"></i> Expire dans ${diffDays} j`;
    }
  } else {
    transferExpiryBadge.className = 'status-badge status-active';
    transferExpiryBadge.innerHTML = '<i class="fa-solid fa-infinity"></i> Permanent';
  }

  // Handle Text note Section
  if (transfer.textContent && transfer.textContent.trim() !== '') {
    textContentSection.style.display = 'block';
    textPreview.innerText = transfer.textContent;
  } else {
    textContentSection.style.display = 'none';
  }

  // Handle Files List Section
  if (transfer.files && transfer.files.length > 0) {
    filesSection.style.display = 'block';
    filesCountSpan.innerText = transfer.files.length;
    
    downloadList.innerHTML = '';
    
    transfer.files.forEach(file => {
      const dlItem = document.createElement('div');
      dlItem.className = 'download-item';
      
      let dlUrl = `/api/transfers/${transferId}/files/${file.id}`;
      if (sharedPassword) {
        dlUrl += `?password=${encodeURIComponent(sharedPassword)}`;
      }

      dlItem.innerHTML = `
        <div class="file-info">
          <i class="fa-solid ${getFileIcon(file.name)}"></i>
          <div class="file-details">
            <span class="file-name" title="${file.name}">${file.name}</span>
            <span class="file-size">${formatBytes(file.size)}</span>
          </div>
        </div>
        <a href="${dlUrl}" class="btn-download" download="${file.name}">
          <i class="fa-solid fa-download"></i> Télécharger
        </a>
      `;
      downloadList.appendChild(dlItem);
    });
  } else {
    filesSection.style.display = 'none';
  }
}

// Download all files sequentially
function downloadAllFiles() {
  const downloadLinks = downloadList.querySelectorAll('.btn-download');
  if (downloadLinks.length === 0) return;

  downloadLinks.forEach((link, index) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = link.href;
      a.download = link.getAttribute('download');
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, index * 400); // 400ms delay per file
  });
}

// Display error screen layout
function showErrorView(title, message, iconClass = 'fa-circle-exclamation', iconColor = 'var(--color-danger)') {
  errorView.style.display = 'flex';
  errorViewTitle.innerText = title;
  errorViewText.innerText = message;
  
  const icon = errorViewIcon.querySelector('i');
  icon.className = `fa-solid ${iconClass}`;
  icon.style.color = iconColor;
  errorViewIcon.style.background = `${iconColor}15`; // 15% opacity matching CSS
  errorViewIcon.style.borderColor = `${iconColor}33`; // 20% opacity
}
