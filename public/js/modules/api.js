/**
 * API Wrapper: Handles multipart transfer creations with real-time progress monitoring
 * @param {FormData} formData Transfer payload
 * @param {function} onProgress Progress callback (receives percent int)
 * @returns {Promise<object>} Response JSON payload
 */
export function createTransfer(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/transfers', true);

    // Track upload percentage
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(new Error("Le serveur a renvoyé un format de réponse invalide."));
        }
      } else {
        try {
          const errorPayload = JSON.parse(xhr.responseText);
          reject(new Error(errorPayload.error || "Échec de la création du transfert."));
        } catch (err) {
          reject(new Error(`Erreur serveur (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error("Impossible de joindre le serveur de partage. Veuillez vérifier votre connexion."));
    };

    xhr.send(formData);
  });
}

/**
 * API Wrapper: Fetches metadata for shared link
 * @param {string} id Unique ID or custom slug of the transfer
 * @returns {Promise<object>} Transfer details JSON payload
 */
export async function fetchTransferMetadata(id) {
  const res = await fetch(`/api/transfers/${id}`);
  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new Error(errorPayload.error || `Erreur serveur (${res.status})`);
  }
  return res.json();
}

/**
 * API Wrapper: Unlocks a password-protected transfer
 * @param {string} id Unique ID or custom slug
 * @param {string} password Raw secure password
 * @returns {Promise<object>} Full unlocked transfer contents (files list, text message)
 */
export async function unlockTransfer(id, password) {
  const res = await fetch(`/api/transfers/${id}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });

  if (res.status === 401) {
    throw new Error('Mot de passe incorrect.');
  }
  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new Error(errorPayload.error || 'Impossible de déverrouiller ce lien de partage.');
  }

  return res.json();
}

/**
 * API Wrapper: Deletes a transfer using its ID and secret delete token
 * @param {string} id Unique ID or custom slug
 * @param {string} deleteToken Secret authorization token
 * @returns {Promise<object>} Success JSON payload
 */
export async function deleteTransfer(id, deleteToken) {
  const res = await fetch(`/api/transfers/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-Delete-Token': deleteToken || ''
    }
  });

  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new Error(errorPayload.error || `Erreur lors de la suppression (${res.status})`);
  }

  return res.json();
}
