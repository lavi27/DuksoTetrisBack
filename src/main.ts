import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';

interface User {
	sessionId: string;
	userNo: number;
	mapData: ArrayBuffer;
	score: number;
	level: number;
	isGameEnd: boolean;
}

class UserManager {
	static default(sessionId: string, userNo: number): User {
		return {
			sessionId,
			userNo,
			mapData: new ArrayBuffer(200),
			score: 0,
			level: 1,
			isGameEnd: false,
		};
	}

	static init(user: User) {
		user.mapData = new ArrayBuffer(200);
		user.score = 0;
		user.level = 1;
		user.isGameEnd = false;
	}
}

const OBSERVER_PASSWORD = 'observer@';

const StaticDir = path.resolve(__dirname, '../static');
const Port = 3000;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use('/static', express.static(StaticDir));

const RoomUserMax = 4;
let roomUserCount = 0;
let roomPlayingUserCount = 0;
let observerSessionId: string | null = null;
const roomUser: Record<string, User> = {};

// --socket.io
io.on('connection', (socket) => {
	socket.on('disconnect', () => {
		if (socket.id == observerSessionId) {
			observerSessionId = null;
			return;
		}

		if (roomUser[socket.id] !== undefined) {
			if (roomPlayingUserCount > 0) roomPlayingUserCount--;
			roomUserCount--;
			const userNo = roomUser[socket.id]!.userNo;
			delete roomUser[socket.id];

			io.to('observerRoom').emit('removeUser', socket.id, userNo);
		}
	});

	socket.on('joinObserver', (pw: string) => {
		if (pw !== OBSERVER_PASSWORD || observerSessionId !== null) {
			socket.emit('joinObserver_failed');
			return;
		}

		observerSessionId = socket.id;
		socket.join('observerRoom');
		socket.emit('joinObserver_success', roomUser);
	});

	socket.on('observer_gameStart', () => {
		roomPlayingUserCount = roomUserCount;
		io.to(['gameRoom', 'observerRoom']).emit('gameReady');
	});

	socket.on('joinGameRoom', () => {
		if (roomUserCount >= RoomUserMax) {
			socket.emit('joinGameRoom_faild');
			return;
		}

		const user = UserManager.default(socket.id, roomUserCount);
		roomUser[socket.id] = user;
		socket.join('gameRoom');
		socket.emit('joinGameRoom_success', {
			userNo: roomUserCount,
		});
		roomUserCount++;

		io.to('observerRoom').emit('addUser', user);
	});

	socket.on(
		'updateGameData',
		(data: { map: ArrayBuffer; score: number; level: number }) => {
			{
				const currUser = roomUser[socket.id];
				if (currUser == undefined) return;

				currUser.mapData = data.map;
				currUser.score = data.score;
				currUser.level = data.level;
			}

			const userScores: { sessionId: string; score: number }[] = [];

			Object.values(roomUser).forEach((val) => {
				userScores.push({ sessionId: val.sessionId, score: val.score });
			});

			userScores.sort((a, b) => a.score - b.score);

			io.to(['gameRoom', 'observerRoom']).emit('updateRank', userScores);
			io.to('observerRoom').emit('updateGameData', roomUser);
		}
	);

	socket.on('gameEnd', () => {
		{
			const currUser = roomUser[socket.id];
			if (currUser == undefined) return;

			currUser.isGameEnd = true;
		}
		roomPlayingUserCount--;
		io.to('observerRoom').emit('updateGameData', roomUser);

		if (roomPlayingUserCount <= 0) {
			setTimeout(() => {
				io.to('observerRoom').emit('updateGameData', roomUser);
				io.to('gameRoom').emit('roomGameDone');
			}, 4000);
		}
	});
});

// --http
app.get('/', (req, res) => {
	res.sendFile(StaticDir + '/player/index.html');
});

app.get('/observer', (req, res) => {
	res.sendFile(StaticDir + '/observer/index.html');
});

httpServer.listen(Port, () => {
	console.log('Lets gooo localhost:3000');
});
