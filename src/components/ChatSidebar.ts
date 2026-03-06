import { escapeHtml } from '@/utils/sanitize';
import { loadFromStorage, saveToStorage } from '@/utils';

const API_BASE = import.meta.env.VITE_WS_API_URL || '';
const STORAGE_KEY = 'worldmonitor-chat-history';
const MAX_STORED = 50;

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  time: string; // ISO string for serialization
}

export class ChatSidebar {
  private el: HTMLElement;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private messages: ChatMessage[] = [];
  private loading = false;

  constructor(mountEl: HTMLElement) {
    this.el = mountEl;
    this.messages = loadFromStorage<ChatMessage[]>(STORAGE_KEY, []);
    this.render();
    this.bindEvents();
    if (this.messages.length > 0) {
      this.renderMessages();
    }
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="chat-messages" id="chatMessages">
        ${this.messages.length === 0 ? `<div class="chat-welcome">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <div class="chat-welcome-text">Aegis AI Assistant</div>
          <div class="chat-welcome-sub">Ask questions about current events, threat analysis, or geopolitical intelligence.</div>
        </div>` : ''}
      </div>
      <div class="chat-input-area">
        <textarea class="chat-input" id="chatInput" placeholder="Ask about intelligence..." rows="1"></textarea>
        <button class="chat-clear" id="chatClear" title="Clear history">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
        <button class="chat-send" id="chatSend" title="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    `;

    this.messagesEl = this.el.querySelector('#chatMessages')!;
    this.inputEl = this.el.querySelector('#chatInput')!;
    this.sendBtn = this.el.querySelector('#chatSend')!;
    this.clearBtn = this.el.querySelector('#chatClear')!;
  }

  private bindEvents(): void {
    this.sendBtn.addEventListener('click', () => this.handleSend());

    this.clearBtn.addEventListener('click', () => {
      this.messages = [];
      saveToStorage(STORAGE_KEY, this.messages);
      this.messagesEl.innerHTML = `<div class="chat-welcome">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <div class="chat-welcome-text">Aegis AI Assistant</div>
        <div class="chat-welcome-sub">Ask questions about current events, threat analysis, or geopolitical intelligence.</div>
      </div>`;
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + 'px';
    });
  }

  private persistMessages(): void {
    const toStore = this.messages.slice(-MAX_STORED);
    saveToStorage(STORAGE_KEY, toStore);
  }

  private async handleSend(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.loading) return;

    this.messages.push({ role: 'user', text, time: new Date().toISOString() });
    this.persistMessages();
    this.renderMessages();

    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';

    this.loading = true;
    this.sendBtn.disabled = true;
    this.addTypingIndicator();

    try {
      const apiMessages = this.messages.map(m => ({ role: m.role, content: m.text }));
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      this.removeTypingIndicator();

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        this.messages.push({
          role: 'assistant',
          text: `Error: ${err.error || `HTTP ${res.status}`}`,
          time: new Date().toISOString(),
        });
      } else {
        const data = await res.json();
        this.messages.push({
          role: 'assistant',
          text: data.text || 'No response received.',
          time: new Date().toISOString(),
        });
      }
    } catch (err) {
      this.removeTypingIndicator();
      this.messages.push({
        role: 'assistant',
        text: 'Network error. Please check your connection.',
        time: new Date().toISOString(),
      });
    } finally {
      this.loading = false;
      this.sendBtn.disabled = false;
    }

    this.persistMessages();
    this.renderMessages();
  }

  private addTypingIndicator(): void {
    const indicator = document.createElement('div');
    indicator.className = 'chat-msg chat-msg--assistant chat-typing';
    indicator.innerHTML = '<div class="chat-msg-bubble chat-typing-dots"><span></span><span></span><span></span></div>';
    this.messagesEl.appendChild(indicator);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private removeTypingIndicator(): void {
    this.messagesEl.querySelector('.chat-typing')?.remove();
  }

  private renderMessages(): void {
    const html = this.messages.map(msg => {
      const cls = msg.role === 'user' ? 'chat-msg chat-msg--user' : 'chat-msg chat-msg--assistant';
      const time = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `<div class="${cls}">
        <div class="chat-msg-bubble">${escapeHtml(msg.text)}</div>
        <div class="chat-msg-time">${time}</div>
      </div>`;
    }).join('');

    this.messagesEl.innerHTML = html;
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  destroy(): void {
    // No global listeners to clean up
  }
}
