LD = function(canvas) {
  if (canvas) {
    this.canvas = canvas;
    this.init();
    this.start();
  }
}

LD.HALF_FOV = 0.25;
LD.FRAME_PERIOD_MS = 20;

LD.prototype.init = function() {
  this.initGL();
  this.initRenderers();
  this.initObjects();
  this.initState();
}

LD.prototype.initGL = function() {
  var gl = WebGLUtils.setupWebGL(this.canvas);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  this.gl = gl;
}

LD.prototype.initRenderers = function() {
  this.eye = vec3.create();
  this.projection = mat4.create();
  this.backgroundRenderer = new LD.BackgroundRenderer(this.gl);
  this.voxelSheetRenderer = new LD.VoxelSheetRenderer(this.gl);
  LD.VoxelSheet.init(this.voxelSheetRenderer);
  this.sprite3dRenderer = new LD.Sprite3DRenderer(this.gl);
  LD.Sprite3D.init(this.sprite3dRenderer);
  this.surfaceRenderer = new LD.SurfaceRenderer(this.gl, [-50, -100, 50, -20]);
}

LD.prototype.initObjects = function() {
  this.renderables = [];
  this.tickables = [];
}

LD.prototype.initState = function() {
  this.tick = 0;
  this.inputX = 0;
  this.inputY = 0;
  this.buttons = 0;
  this.keysDown = {};
}

LD.prototype.wrap = function(func) {
  var otherThis = this;
  return function() {func.apply(otherThis, arguments);}
}

LD.prototype.handleMouseMove = function(evt) {
  newX = 2.0 * evt.clientX / this.canvas.width - 1.0;
  newY = -2.0 * evt.clientY / this.canvas.height + 1.0;
  this.inputX = newX;
  this.inputY = newY;
}

LD.prototype.handleMouseButtons = function(evt) {
  this.buttons = evt.buttons;
}

LD.prototype.handleKeyDown = function(evt) {
  evt = evt || window.event;
  this.keysDown["" + evt.keyCode] = true;
}

LD.prototype.handleKeyUp = function(evt) {
  evt = evt || window.event;
  delete this.keysDown["" + evt.keyCode];
}

LD.prototype.start = function() {
  window.onload = this.wrap(this.render);
  this.canvas.onmousemove = this.wrap(this.handleMouseMove);
  this.canvas.onmousedown = this.wrap(this.handleMouseButtons);
  this.canvas.onmouseup = this.wrap(this.handleMouseButtons);
  window.onkeydown = this.wrap(this.handleKeyDown);
  window.onkeyup = this.wrap(this.handleKeyUp);
  this.lastTickTime = Date.now();
  window.setInterval(this.wrap(LD.prototype.maybeTick), LD.FRAME_PERIOD_MS);
}

LD.prototype.maybeTick = function() {
  var now = Date.now();
  while (now >= this.lastTickTime + LD.FRAME_PERIOD_MS) {
    this.lastTickTime += LD.FRAME_PERIOD_MS;
    this.tick++;
    this.ticked(this.tick);
  } 
}

LD.prototype.ticked = function(tick) {
  for (var ii = 0; ii < this.tickables.length; ii++) {
    this.tickables[ii].ticked(tick);
  }
}

LD.prototype.updateViewport = function() {
  if ((canvas.width != window.innerWidth) || (canvas.height != window.innerHeight)) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.gl.viewport(0, 0, canvas.width, canvas.height)
  }
}

LD.prototype.updateProjection = function() {
  var sqrtAspect = Math.sqrt(canvas.width / canvas.height);
  mat4.frustum(this.projection, -sqrtAspect * LD.HALF_FOV, sqrtAspect * LD.HALF_FOV, -LD.HALF_FOV/sqrtAspect, LD.HALF_FOV/sqrtAspect, 1, 1000);
}

LD.prototype.render = function() {
  this.updateViewport();
  this.updateProjection();
  window.requestAnimFrame(this.wrap(this.render));
  var gl = this.gl;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  for (var ii = 0; ii < this.renderables.length; ii++) {
    this.renderables[ii].render(this.projection, this.eye);
  }
}
