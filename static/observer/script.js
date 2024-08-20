'use strict';
import io from 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js';

/**
 * @typedef {Object} UserData
 * @property {string} sessionId
 * @property {number} userNo
 * @property {Int8Array} mapData
 * @property {number} score
 * @property {number} level
 * @property {number} rank
 * @property {boolean} isGameEnd
 */

const TET_COLOR = [
	'',
	'#5050D0',
	'#2121C0',
	'#A96642',
	'#D4D80F',
	'#0FDC0F',
	'#D066D0',
	'#C03030',
];

/** @type {Object.<string, UserData>} */
const roomUser = {};
/** @type {string[]} */
const sessionIdByUserNo = [];

const addUser = (user) => {
	roomUser[user.sessionId] = user;
	roomUser[user.sessionId].rank = 0;
	roomUser[user.sessionId].mapData = new Int8Array(user.mapData);

	sessionIdByUserNo[user.userNo] = user.sessionId;
};

class Render {
	static BLOCK_SIZE = 20;
	static GRID_W = 10 * Render.BLOCK_SIZE;
	static GRID_H = 20 * Render.BLOCK_SIZE;

	/** @type {HTMLCanvasElement} */
	#canvas;
	/** @type {CanvasRenderingContext2D} */
	#ctx;
	#screenW = 0;
	#screenH = 0;

	/**
	 * @param {HTMLCanvasElement} canvas
	 */
	constructor(canvas) {
		const ctx = canvas.getContext('2d');
		if (ctx === null) throw new Error('HTML Canvas ctx 생성 오류.');

		this.#canvas = canvas;
		this.#ctx = ctx;

		const W = window.innerWidth;
		const H = window.innerHeight;

		this.#screenW = W;
		this.#screenH = H;
		this.#canvas.width = W;
		this.#canvas.height = H;

		requestAnimationFrame(() => this.#renderLoop());
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @returns {[number, number]}
	 */
	centerPos(x, y) {
		return [this.#screenW / 2 + x, this.#screenH / 2 - y];
	}

	#renderLoop() {
		this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

		this.#renderUI();
		this.#renderMapBlock();

		requestAnimationFrame(() => this.#renderLoop());
	}

	#renderMapBlock() {
		const ctx = this.#ctx;

		ctx.beginPath();

		for (let userNo = 0; userNo < 4; userNo++) {
			const user = roomUser[sessionIdByUserNo[userNo]];

			if (user === undefined) {
				continue;
			}

			let i = 0;
			for (let y = 19; y >= 0; y--) {
				for (let x = 0; x < 10; x++) {
					const data = user.mapData[i++];
					if (data === 0) continue;

					ctx.fillStyle = TET_COLOR[data];
					ctx.fillRect(
						...this.centerPos(
							(x - 5) * Render.BLOCK_SIZE + (userNo - 1.5) * 250,
							(y + 1) * Render.BLOCK_SIZE - Render.GRID_H / 2
						),
						Render.BLOCK_SIZE,
						Render.BLOCK_SIZE
					);
				}
			}
		}
	}

	#renderUI() {
		const ctx = this.#ctx;

		for (let i = 0; i < 4; i++) {
			const user = roomUser[sessionIdByUserNo[i]];
			const isUserExist = user !== undefined;
			const offsetX = (i - 1.5) * 250;

			ctx.strokeStyle = '#DDDDDD';
			ctx.fillStyle = !isUserExist || user.isGameEnd ? '#999999' : '#EFEFEF';
			ctx.lineWidth = 0.5;

			ctx.beginPath();
			ctx.rect(
				...this.centerPos(-Render.GRID_W / 2 + offsetX, Render.GRID_H / 2),
				Render.GRID_W,
				Render.GRID_H
			);
			ctx.fill();
			ctx.stroke();

			ctx.beginPath();
			{
				// Grid Vertical line
				for (let i = 0; i < 10; i++) {
					const lineX = (i / 10 - 0.5) * Render.GRID_W + offsetX;

					ctx.moveTo(...this.centerPos(lineX, Render.GRID_H / 2));
					ctx.lineTo(...this.centerPos(lineX, -Render.GRID_H / 2));
				}

				// Grid Horizonal line
				for (let i = 0; i < 20; i++) {
					const lineY = (i / 20 - 0.5) * Render.GRID_H;

					ctx.moveTo(...this.centerPos(-Render.GRID_W / 2 + offsetX, lineY));
					ctx.lineTo(...this.centerPos(Render.GRID_W / 2 + offsetX, lineY));
				}
			}
			ctx.stroke();

			ctx.font = '600 26px Arial';
			ctx.fillStyle = '#222222';
			ctx.fillText(
				isUserExist ? user.score : 0,
				...this.centerPos(-Render.GRID_W / 2 + offsetX, Render.GRID_H / 2 + 30)
			);

			ctx.font = '18px Arial';
			ctx.fillStyle = '#222222';
			ctx.fillText(
				`Level ${isUserExist ? user.level : 0}`,
				...this.centerPos(-Render.GRID_W / 2 + offsetX, Render.GRID_H / 2 + 10)
			);

			ctx.font = '300 30px Arial';
			ctx.fillStyle = '#222222';
			ctx.fillText(
				`# ${isUserExist ? user.rank : 0}`,
				...this.centerPos(offsetX - 27, Render.GRID_H / 2 + 55)
			);

			if (isUserExist && user.isGameEnd) {
				ctx.font = '600 26px Arial';
				ctx.fillStyle = '#DD3333';
				ctx.fillText(
					`GAME OVER`,
					...this.centerPos(offsetX - 80, -Render.GRID_H / 2 - 30)
				);
			}
		}
	}
}

class GameSocket {
	static SERVER_URL = 'localhost:3000';

	/** @type {any} */
	socket;

	/**
	 * @param {string} observerPW
	 */
	constructor(observerPW) {
		this.socket = io.connect(GameSocket.SERVER_URL);

		const socket = this.socket;

		socket.on('updateRank', (data) => {
			data.forEach((v, i) => {
				const user = roomUser[v.sessionId];

				user.score = v.score;
				user.rank = i + 1;
			});
		});

		socket.on('removeUser', (sessionId, userNo) => {
			delete roomUser[sessionId];
			sessionIdByUserNo.splice(userNo);
		});

		socket.on('updateGameData', (data) => {
			Object.values(data).forEach((val) => {
				const user = roomUser[val.sessionId];

				user.level = val.level;
				user.score = val.score;
				user.mapData = new Int8Array(val.mapData);
				user.isGameEnd = val.isGameEnd;
			});
		});

		socket.on('addUser', (user) => addUser(user));

		socket.on('joinObserver_success', (data) => {
			Object.values(data).forEach((val) => addUser(val));
		});

		socket.on('joinObserver_failed', () => {
			throw new Error('Socket 참여 실패.');
		});

		socket.emit('joinObserver', observerPW);
	}

	gameStart() {
		this.socket.emit('observer_gameStart');
	}
}

window.onload = () => {
	const canvas = document.getElementById('canvas');
	const observerPW = prompt('Observer Password?');

	if (canvas === null) throw new Error('HTML Canvas 존재하지 않음.');
	if (observerPW === null) throw new Error('비밀번호는 공백이 될 수 없음.');

	window.gameSocket = new GameSocket(observerPW);
	const render = new Render(canvas);
};
