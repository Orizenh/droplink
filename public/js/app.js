import { formatBytes, getFileIcon } from './modules/utils.js';
import { createTransfer, deleteTransfer } from './modules/api.js';

// Global state for selected files
let selectedFiles = [];

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileListContainer = document.getElementById('file-list');
const transferTitleInput = document.getElementById('transfer-title-input');
const textContentInput = document.getElementById('text-content');
const settingsTrigger = document.getElementById('settings-trigger');
const settingsContent = document.getElementById('settings-content');
const passwordToggle = document.getElementById('password-toggle');
const passwordContainer = document.getElementById('password-container');
const passwordInput = document.getElementById('password-input');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');
const customSlugInput = document.getElementById('custom-slug');
const btnSubmit = document.getElementById('btn-submit');
const btnReset = document.getElementById('btn-reset');
const btnCopy = document.getElementById('btn-copy');

const transferForm = document.getElementById('transfer-form');
const successPanel = document.getElementById('success-panel');
const successUrl = document.getElementById('success-url');
const uploadProgressContainer = document.getElementById('upload-progress-container');
const uploadProgressBar = document.getElementById('upload-progress-bar');
const uploadPercentage = document.getElementById('upload-percentage');
const formError = document.getElementById('form-error');
const errorText = document.getElementById('error-text');
const historyList = document.getElementById('history-list');

// Init Event Listeners on Page Load
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();

  // Collapsible settings toggle
  settingsTrigger.addEventListener('click', () => {
    settingsTrigger.classList.toggle('active');
    settingsContent.classList.toggle('expanded');
  });

  // Password toggle visibility
  passwordToggle.addEventListener('change', () => {
    if (passwordToggle.checked) {
      passwordContainer.style.display = 'flex';
      passwordInput.setAttribute('required', 'true');
      passwordInput.focus();
    } else {
      passwordContainer.style.display = 'none';
      passwordInput.removeAttribute('required');
      passwordInput.value = '';
    }
  });

  // Drag and Drop listeners
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect);

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    addFilesToQueue(files);
  });

  // Submit button
  btnSubmit.addEventListener('click', createShareLink);

  // Success Reset button
  btnReset.addEventListener('click', resetForm);

  // Copy success URL to clipboard
  btnCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(successUrl.href).then(() => {
      btnCopy.classList.add('copied');
      btnCopy.innerHTML = '<i class="fa-solid fa-check"></i> Copié !';
      setTimeout(() => {
        btnCopy.classList.remove('copied');
        btnCopy.innerHTML = '<i class="fa-solid fa-copy"></i> Copier';
      }, 2000);
    });
  });

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  }
});

// File Management Functions
function handleFileSelect(e) {
  const files = e.target.files;
  addFilesToQueue(files);
}

function addFilesToQueue(files) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Check local duplicate
    if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
      continue;
    }
    
    selectedFiles.push(file);
  }
  renderFileList();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
}

function renderFileList() {
  fileListContainer.innerHTML = '';
  if (selectedFiles.length === 0) return;

  selectedFiles.forEach((file, index) => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';

    fileItem.innerHTML = `
      <div class="file-info">
        <i class="fa-solid ${getFileIcon(file.name)}"></i>
        <div class="file-details">
          <span class="file-name" title="${file.name}">${file.name}</span>
          <span class="file-size">${formatBytes(file.size)}</span>
        </div>
      </div>
      <button type="button" class="btn-remove-file" onclick="removeFile(${index})" aria-label="Retirer le fichier">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    fileListContainer.appendChild(fileItem);
  });
}

// API Interaction - Create Share Link
async function createShareLink() {
  // Clear previous errors
  formError.style.display = 'none';

  // Validation: Mandatory title
  if (transferTitleInput.value.trim() === '') {
    showError('Veuillez attribuer un nom obligatoire à votre transfert.');
    return;
  }

  // Validation: Must contain files or text content
  if (selectedFiles.length === 0 && textContentInput.value.trim() === '') {
    showError('Veuillez ajouter au moins un fichier ou écrire un message textuel.');
    return;
  }

  // Validation: Password if enabled
  if (passwordToggle.checked && passwordInput.value.trim() === '') {
    showError('Veuillez saisir un mot de passe de sécurité.');
    return;
  }

  // Expiry date range checking
  if (startDateInput.value && endDateInput.value) {
    if (new Date(startDateInput.value) >= new Date(endDateInput.value)) {
      showError("La date d'expiration doit être postérieure à la date d'activation.");
      return;
    }
  }

  // Prepare form data
  const formData = new FormData();
  
  // Attach files
  selectedFiles.forEach(file => {
    formData.append('files', file);
  });

  // Attach configuration parameters
  const transferTitle = transferTitleInput.value.trim();
  formData.append('title', transferTitle);
  formData.append('textContent', textContentInput.value);
  
  if (passwordToggle.checked) {
    formData.append('password', passwordInput.value);
  }
  if (startDateInput.value) {
    formData.append('startDate', startDateInput.value);
  }
  if (endDateInput.value) {
    formData.append('endDate', endDateInput.value);
  }
  if (customSlugInput.value) {
    formData.append('customSlug', customSlugInput.value);
  }

  // Disable UI and show progress bar
  btnSubmit.disabled = true;
  uploadProgressContainer.style.display = 'block';
  uploadProgressBar.style.width = '0%';
  uploadPercentage.innerText = '0%';

  try {
    const res = await createTransfer(formData, (percent) => {
      uploadProgressBar.style.width = percent + '%';
      uploadPercentage.innerText = percent + '%';
    });

    handleUploadSuccess(res, transferTitle);
  } catch (err) {
    showError(err.message);
    resetUploadProgress();
  }
}

function handleUploadSuccess(response, title) {
  const sharingUrl = window.location.origin + response.url;
  
  // Render Success UI
  transferForm.style.display = 'none';
  successPanel.style.display = 'flex';
  successUrl.href = sharingUrl;
  successUrl.innerText = sharingUrl;

  // Save to browser history
  saveToHistory({
    id: response.transferId,
    title: title,
    deleteToken: response.deleteToken,
    hasPassword: passwordToggle.checked,
    endDate: endDateInput.value ? new Date(endDateInput.value).toISOString() : null,
    startDate: startDateInput.value ? new Date(startDateInput.value).toISOString() : null,
    createdAt: new Date().toISOString(),
    filesCount: selectedFiles.length,
    url: response.url
  });
  
  loadHistory();
}

function resetUploadProgress() {
  btnSubmit.disabled = false;
  uploadProgressContainer.style.display = 'none';
  uploadProgressBar.style.width = '0%';
  uploadPercentage.innerText = '0%';
}

function showError(msg) {
  formError.style.display = 'flex';
  errorText.innerText = msg;
  formError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetForm() {
  selectedFiles = [];
  renderFileList();
  transferForm.reset();
  
  passwordContainer.style.display = 'none';
  passwordInput.removeAttribute('required');
  
  settingsTrigger.classList.remove('active');
  settingsContent.classList.remove('expanded');

  transferForm.style.display = 'grid';
  successPanel.style.display = 'none';
  resetUploadProgress();
  formError.style.display = 'none';
}

// History Functions (localStorage)
function saveToHistory(transfer) {
  let history = JSON.parse(localStorage.getItem('droplink_history') || '[]');
  history = history.filter(item => item.id !== transfer.id);
  history.unshift(transfer);
  localStorage.setItem('droplink_history', JSON.stringify(history));
}

async function deleteHistoryItem(id) {
  let history = JSON.parse(localStorage.getItem('droplink_history') || '[]');
  const item = history.find(item => item.id === id);
  const deleteToken = item ? item.deleteToken : '';

  if (confirm("Voulez-vous vraiment supprimer définitivement ce transfert et ses fichiers du serveur ?")) {
    try {
      await deleteTransfer(id, deleteToken);
    } catch (err) {
      console.error('Failed to delete transfer from server:', err);
      // Allow deletion from local history if the item was already deleted on server (404)
      if (!err.message.includes('404')) {
        alert(`Erreur lors de la suppression sur le serveur : ${err.message}`);
        return;
      }
    }

    history = history.filter(item => item.id !== id);
    localStorage.setItem('droplink_history', JSON.stringify(history));
    loadHistory();
  }
}

function loadHistory() {
  const history = JSON.parse(localStorage.getItem('droplink_history') || '[]');
  historyList.innerHTML = '';

  if (history.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        <i class="fa-solid fa-folder-open"></i>
        <div>Aucun transfert récent</div>
        <p style="font-size: 0.75rem; text-align: center; max-width: 250px;">
          Les liens que vous générez apparaîtront ici pour un accès rapide.
        </p>
      </div>
    `;
    return;
  }

  const now = new Date();

  history.forEach(item => {
    let statusClass = 'status-active';
    let statusLabel = 'Actif';
    let statusIcon = 'fa-check';

    if (item.startDate && now < new Date(item.startDate)) {
      statusClass = 'status-pending';
      statusLabel = 'Planifié';
      statusIcon = 'fa-clock';
    } else if (item.endDate && now > new Date(item.endDate)) {
      statusClass = 'status-expired';
      statusLabel = 'Expiré';
      statusIcon = 'fa-circle-xmark';
    }

    const card = document.createElement('div');
    card.className = 'history-card';

    const fullUrl = window.location.origin + item.url;
    const formattedDate = new Date(item.createdAt).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    card.innerHTML = `
      <div class="history-card-header">
        <div class="history-card-title" title="${item.title}">${item.title}</div>
        <div class="history-card-date">${formattedDate}</div>
      </div>
      <div class="history-card-meta">
        <span class="status-badge ${statusClass}">
          <i class="fa-solid ${statusIcon}"></i> ${statusLabel}
        </span>
        ${item.hasPassword ? '<span class="status-badge badge-locked"><i class="fa-solid fa-key"></i> Protégé</span>' : ''}
        <span style="font-size: 0.8rem; color: var(--color-text-muted);">
          <i class="fa-solid fa-file"></i> ${item.filesCount} fichier(s)
        </span>
      </div>
      <div class="history-actions">
        <a href="${item.url}" class="history-link" target="_blank">
          <i class="fa-solid fa-external-link"></i> Ouvrir le lien
        </a>
        <div style="display: flex; gap: 0.25rem;">
          <button type="button" class="btn-icon btn-copy-history" title="Copier le lien">
            <i class="fa-solid fa-copy"></i>
          </button>
          <button type="button" class="btn-icon btn-delete-history" title="Supprimer de l'historique">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;

    // Modern ES Module event binding instead of global function references
    card.querySelector('.btn-delete-history').addEventListener('click', () => deleteHistoryItem(item.id));
    card.querySelector('.btn-copy-history').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      navigator.clipboard.writeText(fullUrl).then(() => {
        const icon = btn.querySelector('i');
        icon.className = 'fa-solid fa-check';
        btn.style.color = 'var(--color-success)';
        setTimeout(() => {
          icon.className = 'fa-solid fa-copy';
          btn.style.color = '';
        }, 1500);
      });
    });

    historyList.appendChild(card);
  });
}

// Global mappings for remove action (triggered from inline HTML element onclick actions)
window.removeFile = removeFile;
