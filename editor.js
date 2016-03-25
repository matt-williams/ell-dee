Editor = function(canvas) {
  LD.call(this, canvas);
}
Editor.prototype = new LD();

Editor.prototype.initGL = function() {
  LD.prototype.initGL.call(this);
  var gl = this.gl;
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

Editor.prototype.initRenderers = function() {
  LD.prototype.initRenderers.call(this);
  this.backgroundRenderer = new LD.BackgroundRenderer(this.gl);
  this.voxelSheetRenderer = new LD.VoxelSheetRenderer(this.gl);
  LD.VoxelSheet.init(this.voxelSheetRenderer);
  this.sprite3dRenderer = new LD.Sprite3DRenderer(this.gl);
  LD.Sprite3D.init(this.sprite3dRenderer);
}

Editor.prototype.initObjects = function() {
  LD.prototype.initObjects.call(this);
  this.renderables.push(this.backgroundRenderer);
  this.sprites = [];
  var sprite = new LD.EditableSprite3D(this);
  this.renderables.push(sprite);
  this.tickables.push(sprite);
  this.sprites.push(sprite);
  for (var ii = 0; ii < sprite.voxelSheets.length; ii++) {
    var voxelSheet = sprite.voxelSheets[ii];
    var matrix = voxelSheet.modelview;
    mat4.translate(matrix, matrix, [0.75, 0.775 - 0.225 * ii, -5]);
    mat4.scale(matrix, matrix, [0.1, 0.1, 0.1]);
    this.renderables.push(voxelSheet);
  }
}

Editor.prototype.initState = function() {
  LD.prototype.initState.call(this);
  this.dragging = false;
  this.painting = false;
}

Editor.prototype.handleMouseButtons = function(evt) {
  var newButtons = evt.buttons;
  if (!(this.buttons & 1) && (newButtons & 1)) {
    var sprite = this.sprites[0];
    for (var ii = 0; ii < sprite.voxelSheets.length; ii++) {
      var pickCoord = sprite.voxelSheets[ii].pick(this.projection, [this.inputX, this.inputY]);
      if (pickCoord) {
        sprite.setVoxel(pickCoord[0], pickCoord[1], pickCoord[2], 255, 0, 255);
	this.painting = true;
	break;
      }
    }
    if (!this.painting) {
      this.dragging = true;
      this.dragStartX = this.inputX;
      this.dragStartY = this.inputY;
      this.dragStartRotation = mat4.clone(this.sprites[0].rotation);
    }
  } else if ((this.buttons & 1) && !(newButtons & 1)) {
    this.painting = false;
    this.dragging = false;
  }
  return LD.prototype.handleMouseButtons.call(this, evt);
}

Editor.prototype.handleMouseMove = function(evt) {
  LD.prototype.handleMouseMove.call(this, evt);
  if (this.painting) {
    var sprite = this.sprites[0];
    for (var z = 0; z < sprite.voxelSheets.length; z++) {
      var pickCoord = sprite.voxelSheets[z].pick(this.projection, [this.inputX, this.inputY]);
      if (pickCoord) {
        sprite.setVoxel(pickCoord[0], pickCoord[1], pickCoord[2], 255, 0, 255);
      }
    }
  } else if (this.dragging) {
    mat4.identity(this.sprites[0].rotation);
    mat4.rotateY(this.sprites[0].rotation, this.sprites[0].rotation, (this.inputX - this.dragStartX) * 5);
    mat4.rotateX(this.sprites[0].rotation, this.sprites[0].rotation, (this.inputY - this.dragStartY) * 5);
    mat4.multiply(this.sprites[0].rotation, this.sprites[0].rotation, this.dragStartRotation);
  }
}

Editor.prototype.start = function() {
  this.loadWorking();
  window.onunload = this.wrap(this.saveWorking);
  LD.prototype.start.call(this);
}

Editor.prototype.loadWorking = function() {
  var img = document.createElement("img");
  img.src = decodeURIComponent(document.cookie);
  var sprite = this.sprites[0];
  img.onload = function() {
    var context = sprite.canvas.getCanvas().getContext("2d");
    context.drawImage(img, 0, 0);
    sprite.voxelMap.set(sprite.canvas.getCanvas());
  }
}

Editor.prototype.saveWorking = function() {
  document.cookie = encodeURIComponent(this.sprites[0].toDataURL());
}
