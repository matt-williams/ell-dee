Terrain = function(canvas) {
  LD.call(this, canvas);
}
Terrain.prototype = new LD();

Terrain.prototype.initGL = function() {
  LD.prototype.initGL.call(this);
  var gl = this.gl;
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

Terrain.prototype.initRenderers = function() {
  LD.prototype.initRenderers.call(this);
  this.terrainRenderer = new LD.TerrainRenderer(this.gl);
  this.terrainLightRenderer = new LD.TerrainLightRenderer(this.gl);
  LD.TerrainChunk.init(this.terrainRenderer, this.terrainLightRenderer);
}

Terrain.prototype.initObjects = function() {
  LD.prototype.initObjects.call(this);

  var d = [
    {z:   0, cliffX: true, cliffY: true}, {z: 0.5}, {z: 0.5}, {z:   1, cliffY: true}, {z:   1, cliffY: true}, 
    {z: 0.5}, {z: 0.5}, {z: 0.5}, {z:   0}, {z:   0},
    {z: 0.5}, {z: 0.5}, {z: 0, cliffY: true}, {z: 0, cliffY: true}, {z: 0},
    {z: 1, cliffX: true, cliffY: true}, {z: 0.5, cliffX: true}, {z: 1, cliffY: true}, {z: 1, cliffX: true, cliffY: true}, {z: 0, cliffY: true},
    {z: 0, cliffX: true}, {z: 0.5, cliffX: true}, {z: 0}, {z: 0, cliffX: true}, {z: 1}
  ];

  var modelview = mat4.create();
  mat4.translate(modelview, modelview, [0, 0, -10]);
  mat4.rotateX(modelview, modelview, -Math.PI / 3);
  mat4.translate(modelview, modelview, [-2.5, -2.5, -1]);

  var terrainChunk = new LD.TerrainChunk(d, 5, 5, modelview);

  this.renderables.push(terrainChunk);
  this.tickables.push(terrainChunk);
}
