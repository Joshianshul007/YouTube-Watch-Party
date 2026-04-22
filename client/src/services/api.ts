import axios from 'axios';

/** Render host only (e.g. https://x.onrender.com) must become https://x.onrender.com/api — routes live under /api. */
const normalizeApiBase = (raw: string) => {
  const base = raw.trim().replace(/\/+$/, '');
  if (base.endsWith('/api')) return base;
  return `${base}/api`;
};

const API_URL = import.meta.env.VITE_API_URL
  ? normalizeApiBase(import.meta.env.VITE_API_URL as string)
  : import.meta.env.PROD
    ? '/api'
    : 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const createRoom = async (username: string) => {
  const response = await api.post('/rooms', { username });
  return response.data;
};

export const joinRoom = async (roomCode: string, username: string) => {
  const response = await api.post('/rooms/join', { roomCode, username });
  return response.data;
};

export const getRoom = async (roomId: string) => {
  const response = await api.get(`/rooms/${roomId}`);
  return response.data;
};
