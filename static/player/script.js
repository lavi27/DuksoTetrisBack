'use strict';
import io from 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js';

/**
 * @typedef {keyof Input.INPUT} INPUT
 * @typedef {0|1|2|3|4|5|6|7} TETROMINO_TYPE
 */
const TETROMINO = [
	{}, // dummyData
	{
		// I
		x: 1,
		y: 0,
		width: 1,
		height: 4,
		color: '#5050D0',
		posData: [1, 0, 1, 1, 1, 2, 1, 3],
	},
	{
		// J
		x: 1,
		y: 0,
		width: 2,
		height: 3,
		color: '#2121C0',
		posData: [2, 0, 2, 1, 2, 2, 1, 2],
	},
	{
		// L
		x: 1,
		y: 0,
		width: 2,
		height: 3,
		color: '#A96642',
		posData: [1, 0, 1, 1, 1, 2, 2, 2],
	},
	{
		// O
		x: 1,
		y: 1,
		width: 2,
		height: 2,
		color: '#D4D80F',
		posData: [1, 1, 1, 2, 2, 1, 2, 2],
	},
	{
		// S
		x: 1,
		y: 1,
		width: 3,
		height: 2,
		color: '#0FDC0F',
		posData: [2, 1, 3, 1, 1, 2, 2, 2],
	},
	{
		// T
		x: 1,
		y: 1,
		width: 3,
		height: 2,
		color: '#D066D0',
		posData: [1, 1, 2, 1, 3, 1, 2, 2],
	},
	{
		// Z
		x: 1,
		y: 1,
		width: 3,
		height: 2,
		color: '#C03030',
		posData: [1, 1, 2, 1, 2, 2, 3, 2],
	},
];

//SECTION - Utils

/**
 * @param {number} min
 * @param {number} max
 * @return {number}
 */
const randInt = (min, max) => Math.floor(Math.random() * (max - min)) + min;

/**
 * @param {number} x
 * @param {number} y
 * @param {SPIN_TYPE} type
 * @returns {[number, number]}
 */
const posRotate = (x, y, type) => {
	const SIN = [0, 1, 0, -1];
	const COS = [1, 0, -1, 0];

	const sin = SIN[type];
	const cos = COS[type];
	const x2 = x - 1.5;
	const y2 = y - 1.5;

	return [x2 * cos - y2 * sin + 1.5, x2 * sin + y2 * cos + 1.5];
};

class EventEmitter extends EventTarget {
	constructor() {
		super();
	}

	/**
	 * @param {string} name
	 * @param {any} data
	 */
	emit(name, data) {
		this.dispatchEvent(new CustomEvent(name, { detail: data }));
	}
}

//SECTION - Main

class Input extends EventEmitter {
	static INPUT = {
		blockLeft: 'blockLeft',
		blockRight: 'blockRight',
		blockDown: 'blockDown',
		blockHardDrop: 'blockHardDrop',
		blockSpinClockwise: 'blockSpinClockwise',
		blockSwap: 'blockSwap',
	};

	/** @type { {down: Record.<INPUT, boolean>} } */
	#data = {
		down: {},
	};
	/** @type {typeof Input.INPUT} */
	#keyMapping = {
		blockLeft: 'ArrowLeft',
		blockRight: 'ArrowRight',
		blockDown: 'ArrowDown',
		blockHardDrop: ' ',
		blockSpinClockwise: 'ArrowUp',
		blockSwap: 'Shift',
	};
	/** @type {Object.<string, INPUT>} */
	#keyMappingRev = {};
	/** @type {boolean} */
	#isListening = false;

	get isListening() {
		return this.#isListening;
	}

	/** @type {Function} */
	onKeyDownBind;
	/** @type {Function} */
	onKeyUpBind;

	constructor() {
		super();

		this.onKeyDownBind = this.#onKeyDown.bind(this);
		this.onKeyUpBind = this.#onKeyUp.bind(this);

		this.init();
	}

	init() {
		this.removeListen();

		this.#keyMappingRev = {};
		this.#data.down = {};

		Object.entries(this.#keyMapping).forEach(([key, val]) => {
			this.#keyMappingRev[val] = key;
			this.#data.down[key] = false;
		});
	}

	addListen() {
		if (this.#isListening === true) return;
		this.#isListening = true;

		window.addEventListener('keydown', this.onKeyDownBind);
		window.addEventListener('keyup', this.onKeyUpBind);
	}

	removeListen() {
		if (this.#isListening === false) return;
		this.#isListening = false;

		window.removeEventListener('keydown', this.onKeyDownBind);
		window.removeEventListener('keyup', this.onKeyUpBind);
	}

	/**
	 * @param {INPUT} key
	 * @returns {boolean}
	 */
	isDown(key) {
		if (this.#data.down[key] === undefined) return false;
		return this.#data.down[key];
	}

	/**
	 * @param {KeyboardEvent} e
	 */
	#onKeyDown(e) {
		const input = this.#keyMappingRev[e.key];
		if (input === undefined) return;

		this.emit(input);
		this.#data.down[input] = true;
	}

	/**
	 * @param {KeyboardEvent} e
	 */
	#onKeyUp(e) {
		const input = this.#keyMappingRev[e.key];
		if (input === undefined) return;

		this.#data.down[input] = false;
	}
}

class TileMap {
	static LEN_X = 10;
	static LEN_Y = 20;

	/** @type {TETROMINO_TYPE[]} */
	data = new Int8Array(TileMap.LEN_X * TileMap.LEN_Y);

	init() {
		this.data = new Int8Array(TileMap.LEN_X * TileMap.LEN_Y);
	}

	/**
	 * @param {number} y
	 */
	#removeLine(y) {
		for (; y >= 1; y--) {
			for (let x = 0; x < TileMap.LEN_X; x++) {
				this.setBlock(x, y, this.getBlock(x, y - 1));
			}
		}
	}

	/**
	 * Check eveny lines in tileMap and return the number of removed lines.
	 *
	 * 타일맵의 모든 라인들을 확인하며 꽉 찬 줄은 제거하고, 제거된 줄의 개수를 리턴합니다.
	 * @returns {number}
	 */
	checkFullLine() {
		let removeCnt = 0;

		Y_LOOP: for (let y = TileMap.LEN_Y - 1; y >= 1; y--) {
			for (let x = 0; x < TileMap.LEN_X; x++) {
				if (this.getBlock(x, y) === 0) continue Y_LOOP;
			}

			removeCnt++;
			this.#removeLine(y);
			y++;
		}

		return removeCnt;
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @returns {TETROMINO_TYPE}
	 */
	getBlock(x, y) {
		return this.data[x + y * TileMap.LEN_X];
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {TETROMINO_TYPE} type
	 */
	setBlock(x, y, type) {
		this.data[x + y * TileMap.LEN_X] = type;
	}
}

/**
 * @typedef {0|1|2|3} COLID
 * @typedef {0|1|2|3} SPIN_TYPE
 */
class CurrBlock extends EventEmitter {
	/** @type {COLID} */
	static COLID_WALL_LEFT = 0;
	/** @type {COLID} */
	static COLID_WALL_RIGHT = 1;
	/** @type {COLID} */
	static COLID_FLOOR = 2;
	/** @type {COLID} */
	static COLID_MAP_BLOCK = 3;

	static ON_PLACED = 'ON_PLACED';

	/** @type {boolean} */
	#isSwaped = false;
	/** @type {number} */
	x = 0;
	/** @type {number} */
	y = 0;
	/** @type {SPIN_TYPE} */
	spinType = 0;
	/** @type {TETROMINO_TYPE} */
	type = randInt(1, 7);
	/** @type {TETROMINO_TYPE} */
	nextType = randInt(1, 7);
	/** @type {TETROMINO_TYPE} */
	holdType = 0;

	/** @type {GameSystem} */
	gameSystem;

	/**
	 * @param {GameSystem} gameSystem
	 */
	constructor(gameSystem) {
		super();

		this.gameSystem = gameSystem;

		this.gameSystem.input.addEventListener(Input.INPUT.blockHardDrop, () =>
			this.hardDrop()
		);
		this.gameSystem.input.addEventListener(Input.INPUT.blockDown, () =>
			this.moveDown()
		);
		this.gameSystem.input.addEventListener(Input.INPUT.blockLeft, () =>
			this.moveLeft()
		);
		this.gameSystem.input.addEventListener(Input.INPUT.blockRight, () =>
			this.moveRight()
		);
		this.gameSystem.input.addEventListener(Input.INPUT.blockSpinClockwise, () =>
			this.spin()
		);
		this.gameSystem.input.addEventListener(Input.INPUT.blockSwap, () =>
			this.swap()
		);
	}

	init() {
		this.x = 0;
		this.y = 0;
		this.spinType = 0;
		this.#isSwaped = false;
		this.type = randInt(1, 7);
		this.nextType = randInt(1, 7);
		this.holdType = 0;
	}

	#initPos() {
		this.x = 0;
		this.y = 0;
		this.spinType = 0;
	}

	#changeToNext() {
		this.type = this.nextType;
		this.nextType = randInt(1, 7);
	}

	#place() {
		const tet = TETROMINO[this.type].posData;

		for (let i = 0; i < 8; i += 2) {
			const [x, y] = posRotate(tet[i], tet[i + 1], this.spinType);

			this.gameSystem.tileMap.setBlock(x + this.x, y + this.y, this.type);
		}

		this.#isSwaped = false;
		this.#changeToNext();
		this.#initPos();

		this.emit(CurrBlock.ON_PLACED);
	}

	/**
	 * @param  {...COLID} idxs
	 * @returns {boolean}
	 */
	#isColid(...idxs) {
		const tet = TETROMINO[this.type].posData;
		const conds = [false, false, false, false];

		for (let i = 0; i < 8; i += 2) {
			const [x1, y1] = posRotate(tet[i], tet[i + 1], this.spinType);
			const x2 = x1 + this.x;
			const y2 = y1 + this.y;

			if (x2 < 0) conds[CurrBlock.COLID_WALL_LEFT] = true;
			if (x2 >= TileMap.LEN_X) conds[CurrBlock.COLID_WALL_RIGHT] = true;
			if (y2 >= TileMap.LEN_Y) conds[CurrBlock.COLID_FLOOR] = true;
			if (this.gameSystem.tileMap.getBlock(x2, y2) != 0)
				conds[CurrBlock.COLID_MAP_BLOCK] = true;
		}

		let retVal = false;
		idxs.forEach((val) => {
			if (conds[val] === true) retVal = true;
		});

		return retVal;
	}

	moveLeft() {
		this.x--;

		if (
			this.#isColid(CurrBlock.COLID_WALL_LEFT, CurrBlock.COLID_MAP_BLOCK) ===
			true
		)
			this.x++;
	}

	moveRight() {
		this.x++;

		if (
			this.#isColid(CurrBlock.COLID_WALL_RIGHT, CurrBlock.COLID_MAP_BLOCK) ===
			true
		)
			this.x--;
	}

	spin() {
		if (++this.spinType > 3) this.spinType = 0;

		if (
			this.#isColid(CurrBlock.COLID_FLOOR, CurrBlock.COLID_MAP_BLOCK) === true
		) {
			if (--this.spinType < 0) this.spinType = 3;
			return;
		}

		while (this.#isColid(CurrBlock.COLID_WALL_LEFT) === true) {
			this.x++;
		}

		while (this.#isColid(CurrBlock.COLID_WALL_RIGHT) === true) {
			this.x--;
		}
	}

	moveDown() {
		this.y++;

		if (
			this.#isColid(CurrBlock.COLID_FLOOR, CurrBlock.COLID_MAP_BLOCK) === true
		) {
			this.y--;

			this.#place();
		}
	}

	hardDrop() {
		this.y = this.getHardDropY();

		this.#place();
	}

	swap() {
		if (this.#isSwaped === true) return;
		this.#isSwaped = true;

		if (this.holdType === 0) {
			this.holdType = this.type;
			this.#changeToNext();
		} else {
			const tmp = this.holdType;
			this.holdType = this.type;
			this.type = tmp;
		}

		this.#initPos();
	}

	getHardDropY() {
		const tmp = this.y;

		while (
			this.#isColid(CurrBlock.COLID_FLOOR, CurrBlock.COLID_MAP_BLOCK) === false
		) {
			this.y++;
		}
		this.y--;

		const retValue = this.y;
		this.y = tmp;
		return retValue;
	}
}

class Render {
	static BLOCK_SIZE = 28;
	static GRID_W = TileMap.LEN_X * Render.BLOCK_SIZE;
	static GRID_H = TileMap.LEN_Y * Render.BLOCK_SIZE;

	/** @type {GameSystem} */
	gameSystem;
	/** @type {HTMLCanvasElement} */
	#canvas;
	/** @type {CanvasRenderingContext2D} */
	#ctx;

	/** @type {boolean} */
	#isGrayscale = false;

	get isGrayscale() {
		return this.#isGrayscale;
	}
	/**
	 * @param {boolean} value
	 */
	set isGrayscale(value) {
		this.#isGrayscale = value;

		if (value === true) {
			this.#canvas.style.filter = 'grayscale(1)';
		} else {
			this.#canvas.style.filter = 'none';
		}
	}

	get width() {
		return this.#canvas.width;
	}
	/**
	 * @param {number} value
	 */
	set width(value) {
		this.#canvas.width = value;
	}

	get height() {
		return this.#canvas.height;
	}
	/**
	 * @param {number} value
	 */
	set height(value) {
		this.#canvas.height = value;
	}

	/**
	 * @param {GameSystem} gameSystem
	 * @param {HTMLCanvasElement} canvas
	 * @param {CanvasRenderingContext2D} context
	 */
	constructor(gameSystem, canvas, context) {
		this.#canvas = canvas;
		this.#ctx = context;
		this.gameSystem = gameSystem;

		this.resize();

		window.addEventListener('resize', () => this.resize());
	}

	init() {
		this.isGrayscale = false;
		this.resize();
	}

	resize() {
		this.width = window.innerWidth;
		this.height = window.innerHeight;

		this.render();
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @returns {[number, number]}
	 */
	#centerPos(x, y) {
		return [this.width / 2 + x, this.height / 2 - y];
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @returns {[number, number]}
	 */
	#gridPos(x, y) {
		return this.#centerPos(
			(x - TileMap.LEN_X / 2) * Render.BLOCK_SIZE,
			(-y + TileMap.LEN_Y / 2) * Render.BLOCK_SIZE
		);
	}

	render() {
		this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

		this.#renderGrid();
		this.#renderScore();
		this.#renderRank();
		this.#renderNextBlock();
		this.#renderHoldedBlock();
		this.#renderMapBlock();
		this.#renderCurrBlockShadow();
		this.#renderCurrBlock();
		this.#renderComboEffect();

		if (this.gameSystem.isEnd === true) {
			this.#renderGameEnd();
		}
	}

	#renderGameEnd() {
		const ctx = this.#ctx;

		ctx.font = '700 24px Arial';
		ctx.fillStyle = '#000000';
		ctx.fillText(`Game End`, ...this.#centerPos(-60, -300));
	}

	#renderGrid() {
		const ctx = this.#ctx;

		ctx.strokeStyle = '#DDDDDD';
		ctx.fillStyle = '#EFEFEF';
		ctx.lineWidth = 0.5;

		// Block Grid
		ctx.beginPath();
		ctx.rect(
			...this.#centerPos(-Render.GRID_W / 2, Render.GRID_H / 2),
			Render.GRID_W,
			Render.GRID_H
		);
		ctx.fill();
		ctx.stroke();

		ctx.beginPath();
		{
			// Grid Vertical line
			for (let i = 0; i < TileMap.LEN_X; i++) {
				const lineX = (i / TileMap.LEN_X - 0.5) * Render.GRID_W;

				ctx.moveTo(...this.#centerPos(lineX, Render.GRID_H / 2));
				ctx.lineTo(...this.#centerPos(lineX, -Render.GRID_H / 2));
			}

			// Grid Horizonal line
			for (let i = 0; i < TileMap.LEN_Y; i++) {
				const lineY = (i / TileMap.LEN_Y - 0.5) * Render.GRID_H;

				ctx.moveTo(...this.#centerPos(-Render.GRID_W / 2, lineY));
				ctx.lineTo(...this.#centerPos(Render.GRID_W / 2, lineY));
			}
		}
		ctx.stroke();
	}

	#renderScore() {
		const ctx = this.#ctx;

		ctx.font = '600 22px Arial';
		ctx.fillStyle = '#222222';
		ctx.fillText(
			this.gameSystem.score,
			...this.#centerPos(Render.GRID_W / 2 + 20, Render.GRID_H / 2 - 25)
		);

		ctx.font = '16px Arial';
		ctx.fillStyle = '#222222';
		ctx.fillText(
			`Level ${this.gameSystem.level}`,
			...this.#centerPos(Render.GRID_W / 2 + 20, 60)
		);
	}

	#renderRank() {
		const ctx = this.#ctx;

		ctx.font = '600 22px Arial';
		ctx.fillStyle = '#222222';
		ctx.fillText(
			`${this.gameSystem.rank}위`,
			...this.#centerPos(Render.GRID_W / 2 + 20, 0)
		);
	}

	#renderMapBlock() {
		const ctx = this.#ctx;

		ctx.beginPath();

		let i = 0;
		for (let y = 0; y < TileMap.LEN_Y; y++) {
			for (let x = 0; x < TileMap.LEN_X; x++) {
				const data = this.gameSystem.tileMap.data[i++];
				if (data === 0) continue;

				ctx.fillStyle = TETROMINO[data].color;
				ctx.fillRect(
					...this.#gridPos(x, y),
					Render.BLOCK_SIZE,
					Render.BLOCK_SIZE
				);
			}
		}
	}

	#renderCurrBlock() {
		const ctx = this.#ctx;
		const tet = TETROMINO[this.gameSystem.currBlock.type].posData;

		ctx.fillStyle = TETROMINO[this.gameSystem.currBlock.type].color;
		ctx.beginPath();

		for (let i = 0; i < 8; i += 2) {
			const [x, y] = posRotate(
				tet[i],
				tet[i + 1],
				this.gameSystem.currBlock.spinType
			);

			ctx.rect(
				...this.#gridPos(
					x + this.gameSystem.currBlock.x,
					y + this.gameSystem.currBlock.y
				),
				Render.BLOCK_SIZE,
				Render.BLOCK_SIZE
			);
		}

		ctx.fill();
	}

	#renderCurrBlockShadow() {
		const ctx = this.#ctx;
		const tet = TETROMINO[this.gameSystem.currBlock.type].posData;
		const posY = this.gameSystem.currBlock.getHardDropY();

		ctx.fillStyle = '#cccccc';
		ctx.beginPath();

		for (let i = 0; i < 8; i += 2) {
			const [x, y] = posRotate(
				tet[i],
				tet[i + 1],
				this.gameSystem.currBlock.spinType
			);

			ctx.rect(
				...this.#gridPos(x + this.gameSystem.currBlock.x, y + posY),
				Render.BLOCK_SIZE,
				Render.BLOCK_SIZE
			);
		}

		ctx.fill();
	}

	#renderNextBlock() {
		const ctx = this.#ctx;
		const info = TETROMINO[this.gameSystem.currBlock.nextType];
		const tet = info.posData;

		ctx.strokeStyle = '#DDDDDD';
		ctx.fillStyle = '#EFEFEF';
		ctx.beginPath();
		ctx.rect(
			...this.#centerPos(Render.GRID_W / 2 + 20, Render.GRID_H / 2 - 60),
			130,
			130
		);
		ctx.fill();
		ctx.stroke();

		ctx.font = '14px Arial';
		ctx.fillStyle = '#555555';
		ctx.fillText(
			'Next',
			...this.#centerPos(Render.GRID_W / 2 + 20, Render.GRID_H / 2 - 55)
		);

		ctx.fillStyle = TETROMINO[this.gameSystem.currBlock.nextType].color;
		ctx.beginPath();

		for (let i = 0; i < 8; i += 2) {
			const x = tet[i] - info.x;
			const y = tet[i + 1] - info.y;

			ctx.rect(
				...this.#centerPos(
					(x - info.width / 2) * Render.BLOCK_SIZE + 225,
					(-y + info.height / 2) * Render.BLOCK_SIZE + 155
				),
				Render.BLOCK_SIZE,
				Render.BLOCK_SIZE
			);
		}

		ctx.fill();
	}

	#renderHoldedBlock() {
		const ctx = this.#ctx;
		const info = TETROMINO[this.gameSystem.currBlock.holdType];
		const tet = info.posData;

		ctx.strokeStyle = '#DDDDDD';
		ctx.fillStyle = '#EFEFEF';

		ctx.beginPath();
		ctx.rect(
			...this.#centerPos(-Render.GRID_W / 2 - 150, Render.GRID_H / 2 - 60),
			130,
			130
		);
		ctx.fill();
		ctx.stroke();

		ctx.font = '14px Arial';
		ctx.fillStyle = '#555555';
		ctx.fillText(
			'Hold',
			...this.#centerPos(-Render.GRID_W / 2 - 150, Render.GRID_H / 2 - 55)
		);

		if (this.gameSystem.currBlock.holdType === 0) return;

		ctx.fillStyle = info.color;
		ctx.beginPath();

		for (let i = 0; i < 8; i += 2) {
			const x = tet[i] - info.x;
			const y = tet[i + 1] - info.y;

			ctx.rect(
				...this.#centerPos(
					(x - info.width / 2) * Render.BLOCK_SIZE - 225,
					(-y + info.height / 2) * Render.BLOCK_SIZE + 155
				),
				Render.BLOCK_SIZE,
				Render.BLOCK_SIZE
			);
		}

		ctx.fill();
	}

	#renderComboEffect() {
		if (this.gameSystem.combo === 0) return;

		const ctx = this.#ctx;

		ctx.font = '700 24px Arial';
		ctx.fillStyle = '#f55211';
		ctx.fillText(
			`${this.gameSystem.combo}콤보 (놀랍다!)`,
			...this.#centerPos(Render.GRID_W / 2 + 20, 30)
		);
	}
}

class GameSystem extends EventEmitter {
	static ON_AFTER_PLACED = 'ON_AFTER_PLACED';
	static ON_END = 'ON_END';

	/** @type {boolean} */
	#isRunning = false;
	/** @type {boolean} */
	#isEnd = false;
	/** @type {number | null} */
	#tickLoopId = null;
	/** @type {number | null} */
	#blockDownLoopId = null;

	/** @type {number} */
	score = 0;
	/** @type {number} */
	combo = 0;
	/** @type {number} */
	level = 1;
	/** @type {number} */
	rank = 0;
	/** @type {number} */
	#cntToLevelUp = 5;

	/** @type {TileMap} */
	tileMap;
	/** @type {CurrBlock} */
	currBlock;
	/** @type {Render} */
	render;
	/** @type {Input} */
	input;

	get isRunning() {
		return this.#isRunning;
	}

	get isEnd() {
		return this.#isEnd;
	}

	/** @type {Function} */
	onCurrBlockPlacedBind;

	/**
	 * @param {HTMLCanvasElement | null} canvas
	 */
	constructor(canvas) {
		if (canvas === null) throw new Error('캔버스 없음.');

		const context = canvas.getContext('2d');
		if (context === null) throw new Error('Context 생성 오류.');

		super();

		this.onCurrBlockPlacedBind = this.#onCurrBlockPlaced.bind(this);
		this.tileMap = new TileMap();
		this.input = new Input();
		this.currBlock = new CurrBlock(this);
		this.render = new Render(this, canvas, context);

		this.render.render();
	}

	init() {
		if (this.#tickLoopId !== null) cancelAnimationFrame(this.#tickLoopId);
		if (this.#blockDownLoopId !== null) clearInterval(this.#blockDownLoopId);
		if (this.input.isListening === true) this.input.removeListen();
		this.currBlock.removeEventListener(
			CurrBlock.ON_PLACED,
			this.onCurrBlockPlacedBind
		);

		this.#isRunning = false;
		this.#isEnd = false;
		this.#tickLoopId = null;
		this.#blockDownLoopId = null;

		this.score = 0;
		this.combo = 0;
		this.level = 1;
		this.rank = 0;
		this.#cntToLevelUp = 5;

		this.tileMap.init();
		this.currBlock.init();
		this.input.init();
		this.render.init();
	}

	#isEndCondition() {
		for (let i = 0; i < TileMap.LEN_X * 2; i++) {
			if (this.tileMap.data[i] !== 0) {
				return true;
			}
		}

		return false;
	}

	#onCurrBlockPlaced() {
		const removeCnt = this.tileMap.checkFullLine();
		this.#cntToLevelUp -= removeCnt;

		if (this.#cntToLevelUp < 0) {
			this.level++;
			this.#cntToLevelUp = 5;

			clearInterval(this.#blockDownLoopId);
			this.#blockDownLoopId = setInterval(
				() => this.#moveBlockDown(),
				700 / this.level
			);
		}

		if (removeCnt === 0) {
			this.combo = 0;
		} else {
			this.combo += 1;
			this.score += (this.combo + removeCnt) * 100;
		}

		this.emit(GameSystem.ON_AFTER_PLACED);

		if (this.#isEndCondition() === true) {
			this.end();
		}
	}

	start() {
		if (this.#isRunning === true) return;
		this.#isRunning = true;

		this.render.isGrayscale = false;

		this.#tickLoopId = requestAnimationFrame(() => this.#tickLoop());
		this.#blockDownLoopId = setInterval(() => this.#moveBlockDown(), 700);
		this.input.addListen();
		this.currBlock.addEventListener(
			CurrBlock.ON_PLACED,
			this.onCurrBlockPlacedBind
		);
	}

	end() {
		if (this.#isRunning === false) return;
		this.#isRunning = false;
		this.#isEnd = true;

		clearInterval(this.#blockDownLoopId);
		this.input.removeListen();
		this.currBlock.removeEventListener(
			CurrBlock.ON_PLACED,
			this.onCurrBlockPlacedBind
		);

		this.#tickLoopId = null;
		this.#blockDownLoopId = null;
		this.render.isGrayscale = true;

		this.emit(GameSystem.ON_END);

		setTimeout(() => {
			cancelAnimationFrame(this.#tickLoopId);
		}, 100);
	}

	#tick() {
		this.render.render();
	}

	#tickLoop() {
		this.#tick();
		requestAnimationFrame(() => this.#tickLoop());
	}

	#moveBlockDown() {
		if (this.input.isDown(Input.INPUT.blockDown) === false) {
			this.currBlock.moveDown();
		}
	}
}

class GameSocket {
	static SERVER_URL = 'localhost:3000';

	/** @type {number | null} */
	userNo = null;

	/** @type {any} */
	socket;
	/** @type {GameSystem} */
	gameSystem;

	/**
	 * @param {GameSystem} gameSystem
	 */
	constructor(gameSystem) {
		this.socket = io.connect(GameSocket.SERVER_URL);
		this.gameSystem = gameSystem;

		const socket = this.socket;

		socket.on('updateRank', (data) => {
			data.forEach((v, i) => {
				if (v.sessionId === this.socket.id) {
					this.gameSystem.rank = i + 1;
				}
			});
		});

		socket.on('roomGameDone', () => this.gameSystem.init());
		socket.on('gameReady', () => this.gameSystem.start());

		this.gameSystem.addEventListener(GameSystem.ON_AFTER_PLACED, () => {
			this.#sendData();
		});

		this.gameSystem.addEventListener(GameSystem.ON_END, () => {
			socket.emit('gameEnd');
		});

		socket.on('joinGameRoom_success', ({ userNo }) => {
			this.userNo = userNo;
		});

		socket.on('joinGameRoom_failed', () => {
			throw new Error('Socket 참여 오류.');
		});

		socket.emit('joinGameRoom');
	}

	#sendData() {
		this.socket.emit('updateGameData', {
			map: this.gameSystem.tileMap.data.buffer,
			score: this.gameSystem.score,
			level: this.gameSystem.level,
		});
	}
}

window.onload = () => {
	/*
	const userConfig = {
		input: {
			blockLeft: 'ArrowLeft',
			blockRight: 'ArrowRight',
			blockDown: 'ArrowDown',
			blockHardDrop: ' ',
			blockSpinClockwise: 'ArrowUp',
			blockHold: 'Shift',
		},
		render: {
			blockSize: 25,
		},
	};

	const gameConfig = {
		tileMap: {
			lenX: 10,
			lenY: 20,
		},
	};
  */

	const canvas = document.getElementById('canvas');

	window.gameSystem = new GameSystem(canvas);
	window.gameSocket = new GameSocket(window.gameSystem);
};
