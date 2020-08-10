
const canvas = document.getElementById("main");
function updateCanvasSize() {
	canvas.width = document.body.clientWidth;
	canvas.height = document.body.clientHeight;
}
window.addEventListener("load", () => {
	init();
});
window.addEventListener("resize", (e) => {
	updateCanvasSize();
});
updateCanvasSize();
canvas.addEventListener("mousemove", (e) => {
	input.targetX = e.clientX;
	input.targetY = e.clientY;
});

const checkbox = document.getElementById("particles-mode");
checkbox.addEventListener("change", (e) => {
	particles.clear();
	particles.trailMode = checkbox.checked;
});

const input = {
	targetX: canvas.width / 2,
	targetY: canvas.height / 2,
	currentX: canvas.width / 2,
	currentY: canvas.height / 2,
};

/** @type {WebGL2RenderingContext} */
const gl = canvas.getContext("webgl2");
console.log(gl.getSupportedExtensions());

const particles = new GpuParticlesContext();

async function init() {
	await particles.load();
	requestAnimationFrame(updateFrame);
}

function updateFrame() {
	const startX = input.currentX;
	const startY = input.currentY;
	const endX = input.currentX += (input.targetX - input.currentX) * 0.2;
	const endY = input.currentY += (input.targetY - input.currentY) * 0.2;

	const emitCount = particles.trailMode ? 10 : 1000;
	for (let i = 0; i < emitCount; i++) {
		const lifetime = 60 + Math.random() * 100;
		const azimuth = Math.random() * Math.PI * 2.0;
		const elevation = Math.random() * Math.PI - Math.PI / 2;
		const speed = 0.002 + Math.random() * 0.005;
		const vx = speed * Math.sin(azimuth) * Math.cos(elevation);
		const vy = speed * Math.sin(elevation);
		const vz = speed * Math.cos(azimuth) * Math.cos(elevation);
		
		const mx = startX + (endX - startX) * i / emitCount;
		const my = startY + (endY - startY) * i / emitCount;
		const x = mx / canvas.width  * 2 - 1;
		const y = 1 - my / canvas.height * 2;
		particles.emit(lifetime, [x, y, 0.0], [vx, vy, vz]);
	}
	particles.update();

	gl.clearColor(0, 0, 0, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	particles.render();

	requestAnimationFrame(updateFrame);
}
