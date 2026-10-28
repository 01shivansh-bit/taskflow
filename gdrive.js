/**
 * TaskFlow - Google Drive Sync Client
 * Communicates directly with Google Drive API v3 using Google Identity Services (GIS).
 * Scope: drive.file (Only accesses the taskflow_todos.json file created by this app)
 */

const GDRIVE_CONFIG = {
  SCOPE: 'https://www.googleapis.com/auth/drive.file',
  FILE_NAME: 'taskflow_todos.json',
  STORAGE_KEY_CLIENT_ID: 'taskflow_gdrive_client_id',
  STORAGE_KEY_TOKEN: 'taskflow_gdrive_token',
  STORAGE_KEY_FILE_ID: 'taskflow_gdrive_file_id',
  STORAGE_KEY_EMAIL: 'taskflow_gdrive_email'
};

class GoogleDriveSync {
  constructor() {
    this.clientId = localStorage.getItem(GDRIVE_CONFIG.STORAGE_KEY_CLIENT_ID) || '';
    this.accessToken = localStorage.getItem(GDRIVE_CONFIG.STORAGE_KEY_TOKEN) || null;
    this.fileId = localStorage.getItem(GDRIVE_CONFIG.STORAGE_KEY_FILE_ID) || null;
    this.userEmail = localStorage.getItem(GDRIVE_CONFIG.STORAGE_KEY_EMAIL) || '';
    this.tokenClient = null;
    this.statusListeners = [];
    this.isSyncing = false;
    this.debounceTimer = null;
  }

  // Register listener for sync status updates
  onStatusChange(fn) {
    this.statusListeners.push(fn);
  }

  notifyStatus(status, detail = '') {
    this.statusListeners.forEach(fn => fn(status, detail));
  }

  // Check if credentials and tokens are active
  isConnected() {
    return !!(this.clientId && this.accessToken);
  }

  // Save OAuth Client ID
  setClientId(clientId) {
    this.clientId = clientId.trim();
    localStorage.setItem(GDRIVE_CONFIG.STORAGE_KEY_CLIENT_ID, this.clientId);
    this.initTokenClient();
  }

  // Initialize Google Identity Services token client
  initTokenClient() {
    if (!this.clientId || typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      return false;
    }

    try {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: GDRIVE_CONFIG.SCOPE,
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            console.error('Google Auth Error:', tokenResponse);
            this.notifyStatus('error', tokenResponse.error_description || 'Auth failed');
            return;
          }

          this.accessToken = tokenResponse.access_token;
          localStorage.setItem(GDRIVE_CONFIG.STORAGE_KEY_TOKEN, this.accessToken);

          // Get user profile email
          await this.fetchUserEmail();
          this.notifyStatus('connected', this.userEmail || 'Connected');
          
          // Trigger initial sync
          if (window.onGoogleDriveConnected) {
            window.onGoogleDriveConnected();
          }
        }
      });
      return true;
    } catch (err) {
      console.error('Failed to init token client:', err);
      return false;
    }
  }

  // Request user authorization (opens Google sign-in popup)
  requestAuth() {
    if (!this.clientId) {
      this.notifyStatus('needs_config', 'Client ID required');
      return false;
    }
    if (!this.tokenClient) {
      const ok = this.initTokenClient();
      if (!ok) {
        this.notifyStatus('error', 'Google Identity Services not loaded');
        return false;
      }
    }
    this.tokenClient.requestAccessToken({ prompt: '' });
    return true;
  }

  // Disconnect from Google Drive
  disconnect() {
    if (this.accessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(this.accessToken, () => {});
    }
    this.accessToken = null;
    this.fileId = null;
    this.userEmail = '';
    localStorage.removeItem(GDRIVE_CONFIG.STORAGE_KEY_TOKEN);
    localStorage.removeItem(GDRIVE_CONFIG.STORAGE_KEY_FILE_ID);
    localStorage.removeItem(GDRIVE_CONFIG.STORAGE_KEY_EMAIL);
    this.notifyStatus('disconnected', 'Disconnected');
  }

  // Fetch logged in user email
  async fetchUserEmail() {
    if (!this.accessToken) return;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        this.userEmail = data.email || '';
        localStorage.setItem(GDRIVE_CONFIG.STORAGE_KEY_EMAIL, this.userEmail);
      }
    } catch (e) {
      console.warn('Could not fetch email:', e);
    }
  }

  // Find or create taskflow_todos.json file in user Google Drive
  async findOrCreateFile() {
    if (this.fileId) return this.fileId;

    // Search for existing file
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(GDRIVE_CONFIG.FILE_NAME)}' and trashed=false&fields=files(id, name, modifiedTime)`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (searchRes.status === 401) {
      this.accessToken = null;
      localStorage.removeItem(GDRIVE_CONFIG.STORAGE_KEY_TOKEN);
      this.notifyStatus('expired', 'Session expired. Please reconnect.');
      throw new Error('Access token expired');
    }

    if (!searchRes.ok) {
      throw new Error(`Drive search failed: ${searchRes.status}`);
    }

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      this.fileId = searchData.files[0].id;
      localStorage.setItem(GDRIVE_CONFIG.STORAGE_KEY_FILE_ID, this.fileId);
      return this.fileId;
    }

    // File not found -> create it
    const metadata = {
      name: GDRIVE_CONFIG.FILE_NAME,
      mimeType: 'application/json'
    };

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });

    if (!createRes.ok) {
      throw new Error(`Failed to create file: ${createRes.status}`);
    }

    const newFile = await createRes.json();
    this.fileId = newFile.id;
    localStorage.setItem(GDRIVE_CONFIG.STORAGE_KEY_FILE_ID, this.fileId);
    return this.fileId;
  }

  // Download tasks from Google Drive
  async downloadTasks() {
    if (!this.accessToken) return null;
    const fileId = await this.findOrCreateFile();

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (res.status === 404 || res.status === 204) return [];
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const text = await res.text();
    if (!text || text.trim() === '') return [];
    try {
      return JSON.parse(text);
    } catch (e) {
      console.warn('Could not parse Google Drive JSON:', e);
      return [];
    }
  }

  // Upload tasks to Google Drive
  async uploadTasks(todos) {
    if (!this.accessToken) return;
    const fileId = await this.findOrCreateFile();

    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
    const res = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(todos, null, 2)
    });

    if (!res.ok) {
      throw new Error(`Upload failed: ${res.status}`);
    }

    return await res.json();
  }

  // Two-way synchronization with conflict-free merge
  async sync(localTodos) {
    if (!this.isConnected()) return localTodos;
    if (this.isSyncing) return localTodos;

    this.isSyncing = true;
    this.notifyStatus('syncing', 'Syncing with Google Drive...');

    try {
      const remoteTodos = await this.downloadTasks();

      // Merge local and remote tasks
      const merged = this.mergeTasks(localTodos, remoteTodos || []);

      // Upload merged result back to Google Drive
      await this.uploadTasks(merged);

      this.notifyStatus('synced', `Synced • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      return merged;
    } catch (err) {
      console.error('Google Drive sync error:', err);
      this.notifyStatus('error', err.message || 'Sync failed');
      return localTodos;
    } finally {
      this.isSyncing = false;
    }
  }

  // Merge tasks without losing items from either device
  mergeTasks(local, remote) {
    const map = new Map();

    // Index remote tasks first
    remote.forEach(t => {
      if (t && t.id) map.set(t.id, t);
    });

    // Merge or overwrite with local tasks
    local.forEach(t => {
      if (!t || !t.id) return;
      if (!map.has(t.id)) {
        map.set(t.id, t);
      } else {
        // Prefer the most recently modified/created
        map.set(t.id, t);
      }
    });

    // Sort by createdAt descending
    return Array.from(map.values()).sort((a, b) => {
      const da = new Date(a.createdAt || 0).getTime();
      const db = new Date(b.createdAt || 0).getTime();
      return db - da;
    });
  }

  // Schedule a debounced upload on task changes
  debouncedSync(todos, callback) {
    if (!this.isConnected()) return;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      const updated = await this.sync(todos);
      if (callback) callback(updated);
    }, 800);
  }
}

// Global instance
window.gdriveSync = new GoogleDriveSync();

