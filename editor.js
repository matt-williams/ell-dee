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
  this.sheetRenderer = new LD.SheetRenderer(this.gl);
  LD.Sheet.init(this.sheetRenderer);
  Editor.PaletteSheet.init(this.gl);
  this.sprite3dRenderer = new LD.Sprite3DRenderer(this.gl);
  LD.Sprite3D.init(this.sprite3dRenderer);
}

Editor.prototype.initObjects = function() {
  LD.prototype.initObjects.call(this);
  this.renderables.push(this.backgroundRenderer);
  this.sprites = [];
  var sprite = new LD.EditableSprite3D();
  this.renderables.push(sprite);
  this.tickables.push(sprite);
  this.sprites.push(sprite);
  for (var ii = 0; ii < sprite.voxelSheets.length; ii++) {
    var voxelSheet = sprite.voxelSheets[ii];
    var matrix = voxelSheet.modelview;
    mat4.translate(matrix, matrix, [0.5 + 0.45 * Math.floor(ii / 4), 0.675 - 0.45 * (ii % 4), -5]);
    mat4.scale(matrix, matrix, [0.2, 0.2, 0.2]);
    this.renderables.push(voxelSheet);
  }
  this.paletteSheet = new Editor.PaletteSheet();
  var matrix = this.paletteSheet.modelview;
  mat4.translate(matrix, matrix, [1.4, 0, -5]);
  mat4.scale(matrix, matrix, [0.2, 0.2, 0.2]);
  this.renderables.push(this.paletteSheet);
}

Editor.prototype.initState = function() {
  LD.prototype.initState.call(this);
  this.dragging = false;
  this.painting = false;
  this.erasing = false;
  this.color = [255, 255, 255, 255];
}

Editor.prototype.handleInput = function(inputX, inputY, buttons) {
  if (!(this.buttons & 3) && (buttons & 3)) {
    var sprite = this.sprites[0];
    for (var ii = 0; ii < sprite.voxelSheets.length; ii++) {
      var pickCoord = sprite.voxelSheets[ii].pick(this.projection, [inputX, inputY]);
      if (pickCoord) {
        this.painting = !!(buttons & 1);
        this.erasing = !!(buttons & 2);
        if (this.painting) {
          sprite.setVoxel(pickCoord[0], pickCoord[1], pickCoord[2], this.color[0], this.color[1], this.color[2], this.color[3]);
        } else {
          sprite.setVoxel(pickCoord[0], pickCoord[1], pickCoord[2], 0, 0, 0, 0);
        }
        break;
      }
    }
    if ((buttons & 1) &&
        (!this.painting) &&
        (!this.erasing)) {
      var pickColor = this.paletteSheet.pick(this.projection, [inputX, inputY]);
      if (pickColor) {
        this.color = pickColor;
      } else {
        this.dragging = true;
        this.dragStartX = inputX;
        this.dragStartY = inputY;
        this.dragStartRotation = mat4.clone(this.sprites[0].rotation);
      }
    }
  } else if ((this.buttons & 3) && !(buttons & 3)) {
    this.painting = false;
    this.erasing = false;
    this.dragging = false;
  } else if ((this.painting) ||
             (this.erasing)) {
    var sprite = this.sprites[0];
    for (var z = 0; z < sprite.voxelSheets.length; z++) {
      var pickCoord = sprite.voxelSheets[z].pick(this.projection, [inputX, inputY]);
      if (pickCoord) {
        if (this.painting) {
          sprite.setVoxel(pickCoord[0], pickCoord[1], pickCoord[2], this.color[0], this.color[1], this.color[2], this.color[3]);
        } else {
          sprite.setVoxel(pickCoord[0], pickCoord[1], pickCoord[2], 0, 0, 0, 0);
        }
      }
    }
  } else if (this.dragging) {
    mat4.identity(this.sprites[0].rotation);
    mat4.rotateY(this.sprites[0].rotation, this.sprites[0].rotation, (inputX - this.dragStartX) * 5);
    mat4.rotateX(this.sprites[0].rotation, this.sprites[0].rotation, (this.dragStartY - inputY) * 5);
    mat4.multiply(this.sprites[0].rotation, this.sprites[0].rotation, this.dragStartRotation);
  }
  return LD.prototype.handleInput.call(this, inputX, inputY, buttons);
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

Editor.PaletteSheet = function(modelview, animation) {
  LD.Sheet.call(this,
                Editor.PaletteSheet.texture,
                [0.5, 0.0, 0.0,
                 0.0, 0.5, 0.0,
                 0.5, 0.5, 1.0],
                null,
                modelview,
                animation);
}
Editor.PaletteSheet.prototype = new LD.Sheet();

Editor.PaletteSheet.WIDTH = 8;
Editor.PaletteSheet.HEIGHT = 8;

Editor.PaletteSheet.init = function(gl) {
  Editor.PaletteSheet.canvas = new LD.Canvas(Editor.PaletteSheet.WIDTH, Editor.PaletteSheet.HEIGHT);
  Editor.PaletteSheet.texture = new GL.Texture(gl, Editor.PaletteSheet.canvas.getCanvas());
  var image = new Image();
  image.onload = function() {
    Editor.PaletteSheet.canvas.getCanvas().getContext("2d").drawImage(image, 0, 0);
    Editor.PaletteSheet.texture.set(Editor.PaletteSheet.canvas.getCanvas()); 
  }
  image.src = "palette.png";
}

Editor.PaletteSheet.prototype.pick = function(projection, pickPoint) {
  var pickCoord = LD.Sheet.prototype.pick.call(this, projection, pickPoint);
  var pickColor;
  if (pickCoord) {
    console.log(pickCoord);
    pickColor = Editor.PaletteSheet.canvas.getPixel(Math.floor(pickCoord[0] * Editor.PaletteSheet.WIDTH), Math.floor(pickCoord[1] * Editor.PaletteSheet.HEIGHT));
    console.log(pickColor);
  }
  return pickColor;
}
