const API_BASE = '';
const state = {
  accessToken: localStorage.getItem('accessToken') || '',
  refreshToken: localStorage.getItem('refreshToken') || '',
  user: null,
  socket: null,
  settings: loadSettings(),
  presenceTimer: null,
  presenceHeartbeat: null,
  isAwayByIdle: false,
  conversationFilter: 'all',
  conversations: [],
  currentConversationId: null,
  currentConversation: null,
  messages: [],
  friends: [],
  notifications: [],
  stories: []
};

const els = {
  authView: document.getElementById('authView'),
  appView: document.getElementById('appView'),
  authMessage: document.getElementById('authMessage'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  conversationFilters: Array.from(document.querySelectorAll('#conversationFilters .filter-chip')),
  profileAvatar: document.getElementById('profileAvatar'),
  profileName: document.getElementById('profileName'),
  profileHandle: document.getElementById('profileHandle'),
  profilePresence: document.getElementById('profilePresence'),
  profileLastSeen: document.getElementById('profileLastSeen'),
  logoutBtn: document.getElementById('logoutBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  newGroupBtn: document.getElementById('newGroupBtn'),
  archivedBtn: document.getElementById('archivedBtn'),
  statusSelect: document.getElementById('statusSelect'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  searchResults: document.getElementById('searchResults'),
  friendsList: document.getElementById('friendsList'),
  storiesFeed: document.getElementById('storiesFeed'),
  notificationsList: document.getElementById('notificationsList'),
  conversationList: document.getElementById('conversationList'),
  conversationTitle: document.getElementById('conversationTitle'),
  conversationMeta: document.getElementById('conversationMeta'),
  messagesList: document.getElementById('messagesList'),
  messageForm: document.getElementById('messageForm'),
  messageInput: document.getElementById('messageInput'),
  fileInput: document.getElementById('fileInput'),
  messageType: document.getElementById('messageType'),
  refreshConversationsBtn: document.getElementById('refreshConversationsBtn'),
  refreshFriendsBtn: document.getElementById('refreshFriendsBtn'),
  refreshStoriesBtn: document.getElementById('refreshStoriesBtn'),
  markAllReadBtn: document.getElementById('markAllReadBtn'),
  newPrivateBtn: document.getElementById('newPrivateBtn'),
  settingsModal: document.getElementById('settingsModal'),
  settingAutoAway: document.getElementById('settingAutoAway'),
  settingCompact: document.getElementById('settingCompact'),
  settingSounds: document.getElementById('settingSounds'),
  settingPreviews: document.getElementById('settingPreviews'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  toast: document.getElementById('toast')
};

function loadSettings() {
  const defaults = {
    autoAway: true,
    compactMode: false,
    soundEnabled: true,
    showPreviews: true
  };

  try {
    const stored = JSON.parse(localStorage.getItem('chatAppSettings') || '{}');
    return { ...defaults, ...stored };
  } catch (error) {
    return defaults;
  }
}

function notify(text) {
  els.toast.textContent = text;
  els.toast.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

function setMessage(text, isError = false) {
  els.authMessage.textContent = text;
  els.authMessage.style.color = isError ? '#ff6b6b' : '#98a6bf';
}

function setTokenPair(accessToken, refreshToken) {
  state.accessToken = accessToken || '';
  state.refreshToken = refreshToken || '';
  localStorage.setItem('accessToken', state.accessToken);
  localStorage.setItem('refreshToken', state.refreshToken);
}

function saveSettings(nextSettings = state.settings) {
  state.settings = { ...state.settings, ...nextSettings };
  localStorage.setItem('chatAppSettings', JSON.stringify(state.settings));
  document.body.classList.toggle('compact-mode', !!state.settings.compactMode);
}

function syncSettingsForm() {
  els.settingAutoAway.checked = !!state.settings.autoAway;
  els.settingCompact.checked = !!state.settings.compactMode;
  els.settingSounds.checked = !!state.settings.soundEnabled;
  els.settingPreviews.checked = !!state.settings.showPreviews;
  document.body.classList.toggle('compact-mode', !!state.settings.compactMode);
}

function openSettings() {
  syncSettingsForm();
  els.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  els.settingsModal.classList.add('hidden');
}

function formatLastSeen(value) {
  if (!value) {
    return 'Last seen recently';
  }

  const date = new Date(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (Number.isNaN(date.getTime()) || seconds < 60) {
    return 'Last seen just now';
  }
  if (seconds < 3600) {
    return `Last seen ${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `Last seen ${Math.floor(seconds / 3600)}h ago`;
  }
  return `Last seen ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function getStatusClass(status) {
  if (status === 'online') return 'status-online';
  if (status === 'away') return 'status-away';
  if (status === 'busy') return 'status-busy';
  return 'status-offline';
}

function playMessageSound() {
  if (!state.settings.soundEnabled) {
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 760;
  gainNode.gain.value = 0.0001;
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start();
  gainNode.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
  oscillator.stop(context.currentTime + 0.18);
  oscillator.onended = () => context.close();
}

async function setMyStatus(status, { silent = false } = {}) {
  if (!state.user || state.user.status === status) {
    return;
  }

  await request('/api/users/status', {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });

  state.user.status = status;
  state.user.last_seen_at = status === 'offline' ? new Date().toISOString() : state.user.last_seen_at;
  renderProfile();
  renderFriends();
  renderConversations();

  if (!silent) {
    notify(`Status set to ${status}`);
  }
}

function syncPresenceToState({ userId, status, lastSeenAt }) {
  const targetId = Number(userId);

  if (state.user && Number(state.user.id) === targetId) {
    state.user.status = status;
    if (lastSeenAt) {
      state.user.last_seen_at = lastSeenAt;
    }
    renderProfile();
  }

  state.friends = state.friends.map((friend) => {
    if (Number(friend.id) !== targetId) {
      return friend;
    }

    return {
      ...friend,
      status,
      last_seen_at: lastSeenAt || friend.last_seen_at
    };
  });

  state.conversations = state.conversations.map((conversation) => {
    if (!conversation.participant || Number(conversation.participant.id) !== targetId) {
      return conversation;
    }

    return {
      ...conversation,
      participant: {
        ...conversation.participant,
        status,
        last_seen_at: lastSeenAt || conversation.participant.last_seen_at
      }
    };
  });

  renderFriends();
  renderConversations();
}

function markActivity() {
  state.presenceTimer = Date.now();

  if (state.settings.autoAway && state.user && state.user.status === 'away' && !state.isAwayByIdle) {
    state.isAwayByIdle = false;
    setMyStatus('online', { silent: true }).catch(() => {});
  }
}

function setupAutoPresenceTracking() {
  state.presenceTimer = Date.now();
  const resetTimers = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
  resetTimers.forEach((eventName) => {
    window.addEventListener(eventName, markActivity, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.settings.autoAway && state.user && state.user.status === 'online') {
        state.isAwayByIdle = true;
        setMyStatus('away', { silent: true }).catch(() => {});
      }
      return;
    }

    markActivity();
  });

  clearInterval(state.presenceHeartbeat);
  state.presenceHeartbeat = setInterval(() => {
    if (!state.settings.autoAway || !state.user) {
      return;
    }

    const idleMs = Date.now() - (state.presenceTimer || Date.now());
    if (idleMs > 60000 && state.user.status === 'online' && !state.isAwayByIdle) {
      state.isAwayByIdle = true;
      setMyStatus('away', { silent: true }).catch(() => {});
    }
  }, 15000);
}

function getConversationLabel(conversation) {
  if (conversation.type === 'group') {
    return conversation.name || 'Group';
  }

  return conversation.participant?.full_name || conversation.participant?.username || 'Private chat';
}

function getConversationPreview(conversation) {
  if (!state.settings.showPreviews) {
    return '';
  }

  return conversation.last_message_preview || 'No messages yet';
}

function getConversationStatus(conversation) {
  if (conversation.type !== 'private' || !conversation.participant) {
    return null;
  }

  return {
    status: conversation.participant.status || 'offline',
    lastSeenAt: conversation.participant.last_seen_at
  };
}

function formatConversationFilterLabel(filter) {
  return filter.charAt(0).toUpperCase() + filter.slice(1);
}

function resolveFilterMatches(conversation) {
  if (state.conversationFilter === 'all') {
    return true;
  }

  if (state.conversationFilter === 'unread') {
    return conversation.unread_count > 0;
  }

  return conversation.type === state.conversationFilter;
}

function applyConversationFilter(filter) {
  state.conversationFilter = filter;
  els.conversationFilters.forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });
  renderConversations();
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (state.accessToken) {
    headers.set('Authorization', `Bearer ${state.accessToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers
  });

  if (response.status === 401 && state.refreshToken && !path.includes('/auth/refresh')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, options);
    }
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : {};
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

async function refreshAccessToken() {
  if (!state.refreshToken) {
    return false;
  }

  try {
    const payload = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken })
    }).then((res) => res.json());

    if (!payload.accessToken) {
      throw new Error(payload.error || 'Could not refresh token');
    }

    setTokenPair(payload.accessToken, payload.refreshToken);
    state.user = payload.user;
    connectSocket();
    return true;
  } catch (error) {
    await signOut(false);
    return false;
  }
}

function connectSocket() {
  if (!state.accessToken || typeof io === 'undefined') {
    return;
  }

  if (state.socket) {
    state.socket.disconnect();
  }

  state.socket = io({ auth: { token: state.accessToken } });
  state.socket.on('connect', () => {
    state.socket.emit('join_conversations');
  });
  state.socket.on('new_message', ({ message, conversationId }) => {
    if (Number(conversationId) === Number(state.currentConversationId)) {
      state.messages.push(message);
      renderMessages();
      markMessageRead(message.id);
      playMessageSound();
    }
    loadConversations();
  });
  state.socket.on('user_status_update', ({ userId, status, lastSeenAt }) => {
    syncPresenceToState({ userId, status, lastSeenAt });
  });
  state.socket.on('user_online', ({ userId }) => {
    syncPresenceToState({ userId, status: 'online' });
  });
  state.socket.on('user_offline', ({ userId }) => {
    syncPresenceToState({ userId, status: 'offline', lastSeenAt: new Date().toISOString() });
  });
  state.socket.on('message_edited', ({ messageId, content, conversationId }) => {
    if (Number(conversationId) === Number(state.currentConversationId)) {
      const message = state.messages.find((item) => Number(item.id) === Number(messageId));
      if (message) {
        message.content = content;
        message.is_edited = 1;
        renderMessages();
      }
    }
  });
  state.socket.on('message_deleted', ({ messageId, conversationId }) => {
    if (Number(conversationId) === Number(state.currentConversationId)) {
      const message = state.messages.find((item) => Number(item.id) === Number(messageId));
      if (message) {
        message.is_deleted = 1;
        message.content = 'This message was deleted';
        renderMessages();
      }
    }
  });
  state.socket.on('message_reaction', () => {
    if (state.currentConversationId) {
      loadMessages(state.currentConversationId);
    }
  });
  state.socket.on('friend_request_received', () => {
    loadNotifications();
    loadFriends();
  });
  state.socket.on('friend_request_accepted', () => {
    loadFriends();
    loadConversations();
  });
  state.socket.on('new_notification', () => loadNotifications());
  state.socket.on('new_story', () => loadStories());
}

function switchView(loggedIn) {
  els.authView.classList.toggle('hidden', loggedIn);
  els.appView.classList.toggle('hidden', !loggedIn);
}

function activeTab(tabId) {
  els.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabId));
  [els.loginForm, els.registerForm].forEach((form) => form.classList.toggle('active', form.id === tabId));
}

function renderProfile() {
  if (!state.user) return;
  els.profileAvatar.src = state.user.avatar || '/uploads/default-avatar.svg';
  els.profileName.textContent = state.user.full_name || state.user.username;
  els.profileHandle.textContent = `@${state.user.username}`;
  els.statusSelect.value = state.user.status || 'offline';
  els.profilePresence.className = `status-pill ${getStatusClass(state.user.status || 'offline')}`;
  els.profilePresence.textContent = state.user.status || 'offline';

  if (state.user.status === 'offline') {
    els.profileLastSeen.textContent = formatLastSeen(state.user.last_seen_at);
  } else if (state.user.status === 'away') {
    els.profileLastSeen.textContent = 'Away right now';
  } else {
    els.profileLastSeen.textContent = 'Active now';
  }
}

function renderConversations() {
  els.conversationList.innerHTML = '';
  const conversations = state.conversations.filter(resolveFilterMatches).sort((left, right) => {
    if (right.unread_count !== left.unread_count) {
      return right.unread_count - left.unread_count;
    }

    const leftActive = left.participant?.status === 'online' ? 1 : 0;
    const rightActive = right.participant?.status === 'online' ? 1 : 0;
    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });

  conversations.forEach((conversation) => {
    const button = document.createElement('button');
    button.className = `card-item ${Number(conversation.id) === Number(state.currentConversationId) ? 'active' : ''}`;
    button.innerHTML = `
      <strong>${getConversationLabel(conversation)}</strong>
      <span class="conversation-subtitle">
        ${conversation.type === 'private' ? `<span class="conversation-dot ${getStatusClass(conversation.participant?.status || 'offline')}"></span>` : ''}
        <span class="message-preview ${conversation.unread_count > 0 ? 'strong' : ''}">${getConversationPreview(conversation)}</span>
      </span>
    `;
    const badge = document.createElement('span');
    badge.className = 'conversation-badge';
    badge.textContent = conversation.unread_count > 0 ? `${conversation.unread_count}` : formatConversationFilterLabel(conversation.type);
    button.appendChild(badge);
    button.addEventListener('click', () => openConversation(conversation.id));
    els.conversationList.appendChild(button);
  });
}

function renderMessages() {
  els.messagesList.innerHTML = '';
  state.messages.forEach((message) => {
    const item = document.createElement('article');
    item.className = `message-bubble ${Number(message.sender_id) === Number(state.user.id) ? 'me' : ''}`;
    item.innerHTML = `
      <div class="message-meta">
        <span>${message.full_name || message.username}</span>
        <span>${new Date(message.created_at).toLocaleString()}</span>
      </div>
      <div class="message-body"></div>
      <div class="message-actions"></div>
    `;
    item.querySelector('.message-body').textContent = message.is_deleted ? 'This message was deleted' : (message.content || message.file_url || '');
    const actions = item.querySelector('.message-actions');
    if (!message.is_deleted) {
      const reactBtn = document.createElement('button');
      reactBtn.className = 'ghost small';
      reactBtn.textContent = 'React';
      reactBtn.addEventListener('click', () => reactToMessage(message.id));
      actions.appendChild(reactBtn);
    }
    if (Number(message.sender_id) === Number(state.user.id) && !message.is_deleted) {
      const editBtn = document.createElement('button');
      editBtn.className = 'ghost small';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => editMessage(message));
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'ghost small';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => deleteMessage(message.id));
      actions.appendChild(deleteBtn);
    }
    els.messagesList.appendChild(item);
  });
  els.messagesList.scrollTop = els.messagesList.scrollHeight;
}

function renderFriends() {
  els.friendsList.innerHTML = '';
  state.friends.forEach((friend) => {
    const item = document.createElement('div');
    item.className = 'card-item';
    item.innerHTML = `
      <strong>${friend.full_name || friend.username}</strong>
      <span class="conversation-subtitle">
        <span class="status-pill ${getStatusClass(friend.status || 'offline')}">${friend.status || 'offline'}</span>
        <span class="message-preview">${friend.status === 'offline' ? formatLastSeen(friend.last_seen_at) : `@${friend.username}`}</span>
      </span>
    `;
    const dmBtn = document.createElement('button');
    dmBtn.className = 'ghost small';
    dmBtn.textContent = 'Open DM';
    dmBtn.addEventListener('click', async () => {
      const payload = await request(`/api/conversations/private/${friend.id}`, { method: 'POST' });
      await loadConversations(payload.conversation.id);
    });
    item.appendChild(dmBtn);
    els.friendsList.appendChild(item);
  });
}

function renderNotifications() {
  els.notificationsList.innerHTML = '';
  state.notifications.forEach((notification) => {
    const item = document.createElement('div');
    item.className = 'card-item';
    item.innerHTML = `
      <strong>${notification.type}</strong>
      <span>${new Date(notification.created_at).toLocaleString()}</span>
    `;
    els.notificationsList.appendChild(item);
  });
}

function renderStories() {
  els.storiesFeed.innerHTML = '';
  state.stories.forEach((group) => {
    const item = document.createElement('div');
    item.className = 'card-item';
    item.innerHTML = `
      <strong>${group.full_name || group.username}</strong>
      <span>${group.stories.length} active stories</span>
    `;
    els.storiesFeed.appendChild(item);
  });
}

function renderSearchResults(users) {
  els.searchResults.innerHTML = '';
  users.forEach((user) => {
    const item = document.createElement('div');
    item.className = 'card-item';
    item.innerHTML = `
      <strong>${user.full_name || user.username}</strong>
      <span class="message-preview">@${user.username} · ${user.friend_status} · ${user.mutual_friends_count} mutual</span>
    `;
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    const requestBtn = document.createElement('button');
    requestBtn.className = 'ghost small';
    requestBtn.textContent = 'Friend request';
    requestBtn.addEventListener('click', async () => {
      await request(`/api/friends/request/${user.id}`, { method: 'POST' });
      notify('Friend request sent');
      loadFriends();
    });
    const profileBtn = document.createElement('button');
    profileBtn.className = 'ghost small';
    profileBtn.textContent = 'Open';
    profileBtn.addEventListener('click', async () => {
      const payload = await request(`/api/users/${user.username}`);
      notify(`Opened ${payload.user.username}`);
    });
    actions.append(requestBtn, profileBtn);
    item.appendChild(actions);
    els.searchResults.appendChild(item);
  });
}

async function loadConversations(openConversationId) {
  const payload = await request('/api/conversations');
  state.conversations = payload.conversations;
  renderConversations();
  if (openConversationId) {
    await openConversation(openConversationId);
  } else if (!state.currentConversationId && state.conversations[0]) {
    await openConversation(state.conversations[0].id);
  }
}

async function openConversation(conversationId) {
  state.currentConversationId = conversationId;
  const payload = await request(`/api/conversations/${conversationId}`);
  state.currentConversation = payload.conversation;
  els.conversationTitle.textContent = payload.conversation.name || (payload.conversation.type === 'private' ? 'Private chat' : 'Group chat');
  els.conversationMeta.textContent = `${payload.members.length} members`;
  renderConversations();
  await loadMessages(conversationId);
}

async function loadMessages(conversationId) {
  const payload = await request(`/api/conversations/${conversationId}/messages?page=1&limit=50`);
  state.messages = payload.messages;
  renderMessages();
  if (state.socket && state.messages.length) {
    state.socket.emit('message_read', {
      messageId: state.messages[state.messages.length - 1].id,
      conversationId
    });
  }
}

async function loadFriends() {
  const payload = await request('/api/friends');
  state.friends = payload.friends;
  renderFriends();
}

async function loadNotifications() {
  const payload = await request('/api/notifications');
  state.notifications = payload.notifications;
  renderNotifications();
}

async function loadStories() {
  const payload = await request('/api/stories/feed');
  state.stories = payload.stories;
  renderStories();
}

async function searchUsers() {
  const q = els.searchInput.value.trim();
  if (!q) {
    els.searchResults.innerHTML = '';
    return;
  }
  const payload = await request(`/api/users/search?q=${encodeURIComponent(q)}`);
  renderSearchResults(payload.users);
}

async function signOut(callApi = true) {
  if (callApi && state.refreshToken) {
    try {
      await request('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: state.refreshToken })
      });
    } catch (error) {
      // ignore logout errors
    }
  }
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
  setTokenPair('', '');
  state.user = null;
  state.conversations = [];
  state.currentConversationId = null;
  state.currentConversation = null;
  state.messages = [];
  clearInterval(state.presenceHeartbeat);
  switchView(false);
}

async function handleAuthSubmit(form, endpoint) {
  const formData = new FormData(form);
  const body = Object.fromEntries(formData.entries());
  const payload = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then((res) => res.json());

  if (payload.error) {
    throw new Error(payload.error);
  }

  setTokenPair(payload.accessToken, payload.refreshToken);
  state.user = payload.user;
  switchView(true);
  renderProfile();
  syncSettingsForm();
  connectSocket();
  setupAutoPresenceTracking();
  markActivity();
  await Promise.all([loadConversations(), loadFriends(), loadNotifications(), loadStories()]);
}

async function uploadAttachment(file) {
  const formData = new FormData();
  formData.append('file', file);

  const mime = file.type || '';
  const endpoint = mime.startsWith('image/') ? '/api/upload/image'
    : mime.startsWith('video/') ? '/api/upload/video'
    : mime.startsWith('audio/') ? '/api/upload/audio'
    : '/api/upload/file';

  const payload = await request(endpoint, {
    method: 'POST',
    body: formData
  });

  return payload.file_url;
}

async function sendMessage(event) {
  event.preventDefault();
  if (!state.currentConversationId) {
    notify('Select a conversation first');
    return;
  }

  const text = els.messageInput.value.trim();
  const file = els.fileInput.files[0];
  const type = els.messageType.value;
  let fileUrl = '';
  let content = text;

  if (file) {
    fileUrl = await uploadAttachment(file);
    content = text || file.name;
  }

  await request(`/api/conversations/${state.currentConversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      type: file ? type : 'text',
      file_url: fileUrl || null
    })
  });

  els.messageInput.value = '';
  els.fileInput.value = '';
  els.messageType.value = 'text';
  await loadMessages(state.currentConversationId);
}

async function reactToMessage(messageId) {
  const emoji = prompt('Reaction emoji', '👍');
  if (!emoji) return;
  await request(`/api/messages/${messageId}/react`, {
    method: 'POST',
    body: JSON.stringify({ emoji })
  });
}

async function editMessage(message) {
  const content = prompt('Edit message', message.content || '');
  if (!content) return;
  await request(`/api/messages/${message.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ content })
  });
  await loadMessages(state.currentConversationId);
}

async function deleteMessage(messageId) {
  await request(`/api/messages/${messageId}`, { method: 'DELETE' });
  await loadMessages(state.currentConversationId);
}

async function markMessageRead(messageId) {
  if (!state.currentConversationId || !state.socket) return;
  state.socket.emit('message_read', {
    messageId,
    conversationId: state.currentConversationId
  });
}

async function bootstrap() {
  els.tabs.forEach((tab) => tab.addEventListener('click', () => activeTab(tab.dataset.tab)));
  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await handleAuthSubmit(els.loginForm, '/api/auth/login');
    } catch (error) {
      setMessage(error.message, true);
    }
  });
  els.registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await handleAuthSubmit(els.registerForm, '/api/auth/register');
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  els.logoutBtn.addEventListener('click', () => signOut(true));
  els.searchBtn.addEventListener('click', () => searchUsers().catch((error) => notify(error.message)));
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      searchUsers().catch((error) => notify(error.message));
    }
  });
  els.refreshConversationsBtn.addEventListener('click', () => loadConversations().catch((error) => notify(error.message)));
  els.refreshFriendsBtn.addEventListener('click', () => loadFriends().catch((error) => notify(error.message)));
  els.refreshStoriesBtn.addEventListener('click', () => loadStories().catch((error) => notify(error.message)));
  els.settingsBtn.addEventListener('click', openSettings);
  els.newGroupBtn.addEventListener('click', async () => {
    const name = prompt('Group name');
    if (!name) return;

    const usernames = prompt('Member usernames separated by commas');
    if (!usernames) return;

    const memberIds = [];
    for (const rawName of usernames.split(',')) {
      const username = rawName.trim();
      if (!username) continue;
      const result = await request(`/api/users/search?q=${encodeURIComponent(username)}`);
      const match = result.users.find((user) => user.username.toLowerCase() === username.toLowerCase());
      if (match) {
        memberIds.push(match.id);
      }
    }

    const payload = await request('/api/conversations/group', {
      method: 'POST',
      body: JSON.stringify({ name, memberIds })
    });

    await loadConversations(payload.conversation.id);
  });
  els.archivedBtn.addEventListener('click', () => {
    applyConversationFilter('unread');
    notify('Unread chats highlighted');
  });
  els.markAllReadBtn.addEventListener('click', async () => {
    await request('/api/notifications/read-all', { method: 'PATCH' });
    await loadNotifications();
  });
  els.statusSelect.addEventListener('change', async (event) => {
    await request('/api/users/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: event.target.value })
    });
    state.user.status = event.target.value;
    renderProfile();
  });
  els.messageForm.addEventListener('submit', (event) => sendMessage(event).catch((error) => notify(error.message)));
  els.conversationFilters.forEach((button) => {
    button.addEventListener('click', () => applyConversationFilter(button.dataset.filter));
  });
  els.settingsModal.querySelectorAll('[data-close-settings]').forEach((button) => {
    button.addEventListener('click', closeSettings);
  });
  els.saveSettingsBtn.addEventListener('click', () => {
    saveSettings({
      autoAway: els.settingAutoAway.checked,
      compactMode: els.settingCompact.checked,
      soundEnabled: els.settingSounds.checked,
      showPreviews: els.settingPreviews.checked
    });
    renderConversations();
    renderFriends();
    renderProfile();
    closeSettings();
    notify('Settings saved');
  });
  els.newPrivateBtn.addEventListener('click', async () => {
    const username = prompt('Enter username to start a private chat');
    if (!username) return;
    const profile = await request(`/api/users/${encodeURIComponent(username)}`);
    const payload = await request(`/api/conversations/private/${profile.user.id}`, { method: 'POST' });
    await loadConversations(payload.conversation.id);
  });

  if (state.accessToken) {
    try {
      const me = await request('/api/auth/me');
      state.user = me.user;
      switchView(true);
      renderProfile();
      syncSettingsForm();
      connectSocket();
      setupAutoPresenceTracking();
      markActivity();
      await Promise.all([loadConversations(), loadFriends(), loadNotifications(), loadStories()]);
      return;
    } catch (error) {
      await signOut(false);
    }
  }

  switchView(false);
  activeTab('loginForm');
}

bootstrap().catch((error) => {
  console.error(error);
  notify(error.message);
});
