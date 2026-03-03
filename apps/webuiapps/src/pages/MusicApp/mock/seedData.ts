/**
 * MusicApp seed data
 * Following guide.md specification
 */

import type { Song, Playlist } from '../types';

export const SEED_SONGS: Song[] = [
  {
    id: 'song-001',
    title: 'Midnight Dreams',
    artist: 'Luna Sky',
    album: 'Starlight',
    duration: 234,
    coverColor: '#E04848',
    createdAt: Date.now() - 86400000 * 7,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    id: 'song-002',
    title: 'Electric Sunrise',
    artist: 'Neon Pulse',
    album: 'Digital Dawn',
    duration: 198,
    coverColor: '#4A90D9',
    createdAt: Date.now() - 86400000 * 6,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    id: 'song-003',
    title: 'Ocean Waves',
    artist: 'Coastal Vibes',
    album: 'Serenity',
    duration: 267,
    coverColor: '#2ECDA7',
    createdAt: Date.now() - 86400000 * 5,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  {
    id: 'song-004',
    title: 'City Lights',
    artist: 'Urban Echo',
    album: 'Metropolitan',
    duration: 212,
    coverColor: '#9B59B6',
    createdAt: Date.now() - 86400000 * 4,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    id: 'song-005',
    title: 'Forest Rain',
    artist: 'Nature Sounds',
    album: 'Ambient',
    duration: 189,
    coverColor: '#27AE60',
    createdAt: Date.now() - 86400000 * 3,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
];

export const SEED_PLAYLISTS: Playlist[] = [
  {
    id: 'playlist-001',
    name: 'My Favorites',
    songIds: ['song-001', 'song-002', 'song-003'],
    createdAt: Date.now() - 86400000,
  },
  {
    id: 'playlist-002',
    name: 'Chill Vibes',
    songIds: ['song-003', 'song-005'],
    createdAt: Date.now() - 172800000,
  },
  {
    id: 'playlist-003',
    name: 'Workout Mix',
    songIds: ['song-002', 'song-004'],
    createdAt: Date.now() - 259200000,
  },
];
