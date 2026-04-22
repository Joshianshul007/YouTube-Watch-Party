export class Participant {
  id: string;
  username: string;
  role: 'host' | 'moderator' | 'participant';
  socketId: string | null;
  joinedAt: Date;

  constructor(id: string, username: string, role: 'host' | 'moderator' | 'participant') {
    this.id = id;
    this.username = username;
    this.role = role;
    this.socketId = null;
    this.joinedAt = new Date();
  }
}
