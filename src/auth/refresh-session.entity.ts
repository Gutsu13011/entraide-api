import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../users/user.entity.js';

@Entity('refresh_sessions')
@Index('IDX_refresh_sessions_token_hash', ['tokenHash'], {
  unique: true,
})
@Index('IDX_refresh_sessions_user_id', ['userId'])
export class RefreshSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 64, select: false })
  tokenHash: string;

  @Column('datetime')
  expiresAt: Date;

  @Column('datetime', { nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column('integer')
  userId: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'FK_refresh_sessions_user' })
  user: Relation<User>;
}
