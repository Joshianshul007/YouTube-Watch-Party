import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { useRoom } from '../context/RoomContext';
import { ChatMessage } from './ChatMessage';

export const ChatPanel = () => {
  const { socket, chatMessages } = useRoom();
  const [input, setInput] = useState('');
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [chatMessages]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !socket) return;

    socket.emit('chat_message', { message: trimmed });
    setInput('');
  };

  return (
    <section className="chat-panel">
      <div className="chat-header">
        <MessageCircle size={16} />
        Chat
      </div>

      <div className="chat-messages" ref={messageListRef}>
        {chatMessages.length === 0 ? (
          <p className="chat-empty-state">No messages yet. Say hello!</p>
        ) : (
          chatMessages.map((message, index) => (
            <ChatMessage key={`${message.timestamp}-${index}`} message={message} />
          ))
        )}
      </div>

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={input}
          maxLength={300}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn-secondary chat-send-btn" disabled={!input.trim()}>
          <Send size={14} />
          Send
        </button>
      </form>
    </section>
  );
};
