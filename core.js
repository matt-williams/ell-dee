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

LD.prototype.handleInput = function(inputX, inputY, buttons) {
  this.inputX = inputX;
  this.inputY = inputY;
  this.buttons = buttons;
}

LD.prototype.handleKeyDown = function(keyCode) {
  this.keysDown["" + keyCode] = true;
}

LD.prototype.handleKeyUp = function(keyCode) {
  delete this.keysDown["" + keyCode];
}

LD.prototype.start = function() {
  var otherThis = this;
  window.addEventListener("load", this.wrap(this.render), false);
  this.canvas.addEventListener("mousedown", function(evt) {
    evt = evt || window.event;
    inputX = 2.0 * evt.clientX / otherThis.canvas.width - 1.0;
    inputY = -2.0 * evt.clientY / otherThis.canvas.height + 1.0;
    otherThis.handleInput(inputX, inputY, evt.buttons);
  }, false);
  this.canvas.addEventListener("mouseup", function(evt) {
    evt = evt || window.event;
    inputX = 2.0 * evt.clientX / otherThis.canvas.width - 1.0;
    inputY = -2.0 * evt.clientY / otherThis.canvas.height + 1.0;
    otherThis.handleInput(inputX, inputY, evt.buttons);
  }, false);
  this.canvas.addEventListener("mousemove", function(evt) {
    evt = evt || window.event;
    inputX = 2.0 * evt.clientX / otherThis.canvas.width - 1.0;
    inputY = -2.0 * evt.clientY / otherThis.canvas.height + 1.0;
    otherThis.handleInput(inputX, inputY, otherThis.buttons);
  }, false);
  this.canvas.addEventListener("mouseout", function(evt) {
    evt = evt || window.event;
    otherThis.handleInput(otherThis.inputX, otherThis.inputY, 0);
  }, false);
  this.canvas.addEventListener("touchstart", function(evt) {
    evt = evt || window.event;
    evt.preventDefault();
    inputX = 2.0 * evt.touches[0].clientX / otherThis.canvas.width - 1.0;
    inputY = -2.0 * evt.touches[0].clientY / otherThis.canvas.height + 1.0;
    otherThis.handleInput(inputX, inputY, 1);
  }, false);
  this.canvas.addEventListener("touchend", function(evt) {
    evt = evt || window.event;
    evt.preventDefault();
    otherThis.handleInput(otherThis.inputX, otherThis.inputY, 0);
  }, false);
  this.canvas.addEventListener("touchmove", function(evt) {
    evt = evt || window.event;
    evt.preventDefault();
    inputX = 2.0 * evt.touches[0].clientX / otherThis.canvas.width - 1.0;
    inputY = -2.0 * evt.touches[0].clientY / otherThis.canvas.height + 1.0;
    otherThis.handleInput(inputX, inputY, otherThis.buttons);
  }, false);
  this.canvas.addEventListener("touchcancel", function(evt) {
    evt = evt || window.event;
    evt.preventDefault();
    otherThis.handleInput(otherThis.inputX, otherThis.inputY, 0);
  }, false);
  this.canvas.addEventListener("touchleave", function(evt) {
    evt = evt || window.event;
    evt.preventDefault();
    otherThis.handleInput(otherThis.inputX, otherThis.inputY, 0);
  }, false);
  window.addEventListener("keydown", function(evt) {
    evt = evt || window.event;
    otherThis.handleKeyDown(evt.keyCode);
  }, false);
  window.addEventListener("keyup", function(evt) {
    evt = evt || window.event;
    otherThis.handleKeyUp(evt.keyCode);
  }, false);
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
