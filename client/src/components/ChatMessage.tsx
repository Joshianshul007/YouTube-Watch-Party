import type { ChatMessage as ChatMessageType } from '../types';

interface ChatMessageProps {
  message: ChatMessageType;
}

const formatTimestamp = (value: number) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const ChatMessage = ({ message }: ChatMessageProps) => {
  if (message.role === 'system') {
    return (
      <div className="chat-system-message">
        <span>{message.message}</span>
        <time>{formatTimestamp(message.timestamp)}</time>
      </div>
    );
  }

  return (
    <div className="chat-message">
      <div className="chat-message-meta">
        <div className="chat-user-row">
          <strong>{message.username}</strong>
          <span className={`chat-role-badge chat-role-${message.role}`}>{message.role}</span>
        </div>
        <time>{formatTimestamp(message.timestamp)}</time>
      </div>
      <p>{message.message}</p>
    </div>
  );
};
