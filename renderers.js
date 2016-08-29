LD.Surface = function(surfaceRenderer, timeFactor, baseColor, highlightColor, modelview) {
  this.surfaceRenderer = surfaceRenderer;
  this.timeFactor = timeFactor;
  this.xFreq = [Math.random() * 0.2, Math.random() * 0.2 + 0.2, Math.random() * 0.2 + 0.4, Math.random() * 0.2 + 0.2];
  this.xPhase = [Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI];
  this.xAmp = [Math.random() * Math.PI, Math.random() * Math.PI / 2, Math.random() * Math.PI / 4, Math.random() * Math.PI / 8];
  this.zFreq = [Math.random() * 0.2, Math.random() * 0.2 + 0.2, Math.random() * 0.2 + 0.4, Math.random() * 0.2 + 0.2];
  this.zPhase = [Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI];
  this.zAmp = [Math.random() * Math.PI, Math.random() * Math.PI / 2, Math.random() * Math.PI / 4, Math.random() * Math.PI / 8];
  this.baseColor = baseColor;
  this.highlightColor = highlightColor;
  this.modelview = modelview || mat4.create();
}

LD.Surface.prototype.ticked = function(tick) {
  this.tick = tick;
}

LD.Surface.prototype.render = function(projection, eye) {
  this.surfaceRenderer.render(projection, eye,
                              this.modelview,
                              this.tick * this.timeFactor,
                              this.xFreq, this.xPhase, this.xAmp,
                              this.zFreq, this.zPhase, this.zAmp,
                              this.baseColor, this.highlightColor);
}

LD.SurfaceRenderer = function(gl, size) {
  this.gl = gl;
  this.program = new GL.Program(
    gl,
    ["uniform mat4 matrix;",
     "uniform mediump float thetaT;",
     "uniform mediump vec4 xFreq;",
     "uniform mediump vec4 xPhase;",
     "uniform mediump vec4 xAmp;",
     "uniform mediump vec4 zFreq;",
     "uniform mediump vec4 zPhase;",
     "uniform mediump vec4 zAmp;",
     "attribute vec3 pos;",
     "varying highp vec3 pos2;",
     "varying highp vec3 normal;",
     "void main() {",
     "  mediump float thetaX = dot(cos(dot(pos.xxxx, xFreq) + xPhase + thetaT), xAmp);",
     "  mediump float thetaZ = dot(cos(dot(pos.zzzz, zFreq) + zPhase + thetaT), zAmp);",
     "  pos2 = pos;",
     "  pos2.y += (sin(thetaX) + sin(thetaZ)) * 0.05;",
     "  gl_Position = matrix * vec4(pos2, 1);",
     "  normal = normalize(vec3(sin(thetaX), cos(thetaX) + cos(thetaZ), sin(thetaZ)));",
     "}"],
    ["uniform highp vec3 rayOrigin;",
     "uniform lowp vec4 baseColor;",
     "uniform lowp vec4 highlightColor;",
     "varying highp vec3 pos2;",
     "varying highp vec3 normal;",
     "void main() {",
     "  gl_FragColor = baseColor + highlightColor * dot(normalize(pos2 - rayOrigin), normal);",
     "}"]);
  if (!LD.SurfaceRenderer.SURFACE_VERTICES) {
    var vertices = [];
    var dx = LD.SurfaceRenderer.X_STEP;
    var dz = LD.SurfaceRenderer.Z_STEP;
    for (var x = size[0]; x < size[2]; x += dx) {
      for (var z = size[1]; z < size[3]; z += dz) {
        vertices.push(x, 0, z, x, 0, z + dz, x + dx, 0, z);
        vertices.push(x + dx, 0, z, x, 0, z + dz, x + dx, 0, z + dz);
      }
    }
    LD.SurfaceRenderer.SURFACE_VERTICES = vertices;
  }
  this.surfaceVertices = new GL.StaticBuffer(this.gl, LD.SurfaceRenderer.SURFACE_VERTICES);
  this.matrix = mat4.create();
  this.vector = vec3.create();
}

LD.SurfaceRenderer.X_STEP = 2.0;
LD.SurfaceRenderer.Z_STEP = 2.0;

LD.SurfaceRenderer.prototype.render = function(projection, eye, modelview, thetaT, xFreq, xPhase, xAmp, zFreq, zPhase, zAmp, baseColor, highlightColor) {
  var gl = this.gl;
  mat4.invert(this.matrix, modelview);
  vec3.transformMat4(this.vector, eye, this.matrix);
  mat4.multiply(this.matrix, projection, modelview);
  this.program.use({matrix: this.matrix,
                    thetaT: thetaT,
                    xFreq: xFreq,
                    xPhase: xPhase,
                    xAmp: xAmp,
                    zFreq: zFreq,
                    zPhase: zPhase,
                    zAmp: zAmp,
                    rayOrigin: this.vector,
                    baseColor: baseColor,
                    highlightColor: highlightColor},
                   {pos: this.surfaceVertices});
  gl.drawArrays(gl.TRIANGLES, 0, LD.SurfaceRenderer.SURFACE_VERTICES.length / 3);
}

LD.Sprite3DRenderer = function(gl) {
  this.gl = gl;
  // Loosely based on algorithm at http://prideout.net/blog/?p=64
  this.program = new GL.Program(
    gl,
    ["uniform mat4 matrix;",
     "uniform mediump vec3 size;",
     "attribute vec3 pos;",
     "varying mediump vec3 nearPosition;",
     "void main() {",
     "  gl_Position = matrix * vec4(pos, 1);",
     "  nearPosition = pos * size;",
     "}"],
    ["const int MAX_ITERATIONS = 46;", // A ray can pass through at most 46 cells (intuitively, but verified through testing)
     "uniform mediump vec3 rayOrigin;",
     "uniform mediump vec3 size;",
     "uniform mediump mat4 voxelToTexelMatrix;",
     "uniform sampler2D voxelMap;",
     "varying mediump vec3 nearPosition;",
     "varying mediump vec3 rayVector;",
     "mediump float min3(mediump vec3 v) {",
     "  return min(min(v.x, v.y), v.z);",
     "}",
     "mediump float max3(mediump vec3 v) {",
     "  return max(max(v.x, v.y), v.z);",
     "}",
//     "lowp vec3 floatToVec(lowp float x) {",
//     "  return floor(mod(vec3(x) / vec3(1.0, 3.0, 9.0), 3.0) - 1.0) * floor(x / 27.0) / 8.0;",
//     "}",
     "void main() {",
     "  mediump vec3 rayDirection = normalize(nearPosition - rayOrigin * size);",
     "  lowp vec3 signRayDirection = sign(rayDirection);",
     "  lowp vec3 cubeRayDirection = signRayDirection * size;",
     "  mediump float farRayLength = min3((0.5 * cubeRayDirection - nearPosition) / rayDirection);",
     // Fudge factor - rounding errors accumulate and can cause graphical artifacts
     "  farRayLength *= 0.999;",
     "  mediump float rayLength = 0.0;",
     "  mediump vec3 minusDistanceToBound = -mod(abs(nearPosition - cubeRayDirection), 1.0);",
     "  lowp vec3 absFaceNormal = step(0.0, minusDistanceToBound);",
     "  mediump vec3 minusDistanceToNextBound = minusDistanceToBound - absFaceNormal;",
     "  mediump vec3 minusRayLengthDeltaToBound = minusDistanceToNextBound / abs(rayDirection);",
     "  mediump vec3 rayLengthForUnitCube = signRayDirection / rayDirection;",
     "  mediump vec3 voxelPosition = floor(nearPosition + 0.5 * absFaceNormal * signRayDirection);",
//     "  gl_FragColor = vec4(voxelPosition / size + 0.5, 1);",
//     "  return;",
     "  lowp vec4 voxelColor;",
     "  lowp vec4 lightingVector = vec4(abs(rayDirection) * 0.5, 0.5);",
     "  for (int iteration = 0; iteration < MAX_ITERATIONS; ++iteration) {",
//     "    lowp vec3 rayToMidVoxelPosition = voxelPosition + 0.5 - nearPosition;",
//     "    mediump float rayToMidVoxelLength = dot(rayToMidVoxelPosition, rayDirection);",
     "    voxelColor = texture2D(voxelMap, (voxelToTexelMatrix * vec4(voxelPosition, 1)).xy);",
//     "    lowp vec3 surfaceVector = floatToVec(voxelColor.a);",
//     "    mediump float surfaceIntersectionOffset = dot(surfaceVector, rayDirection);",
//     "    if (rayLength > rayToMidVoxelLength + surfaceIntersectionOffset) {",
     "    if (voxelColor.a > 0.0) {",
     "      break;",
     "    }",
     "    mediump float minusRayLengthDelta = max3(minusRayLengthDeltaToBound);",
     "    minusRayLengthDeltaToBound -= minusRayLengthDelta;",
     "    absFaceNormal = step(0.0, minusRayLengthDeltaToBound);",
     "    rayLength -= minusRayLengthDelta;",
//     "    if (rayLength > rayToMidVoxelLength - surfaceIntersectionOffset) {",
//     "      absFaceNormal = normalize(surfaceVector) * signRayDirection;",
//     "      break;",
//     "    }",
     "    if (rayLength >= farRayLength) {",
     "      discard;",
     "    }",
     "    minusRayLengthDeltaToBound -= absFaceNormal * rayLengthForUnitCube;",
     "    voxelPosition += absFaceNormal * signRayDirection;",
     "  }",
     "  gl_FragColor = vec4(voxelColor.rgb * dot(lightingVector, vec4(absFaceNormal, 1.0)), voxelColor.a);",
     "  return;",
     "}"]);
  this.cubeVertices = new GL.StaticBuffer(this.gl, LD.Sprite3DRenderer.CUBE_VERTICES);
  this.matrix = mat4.create();
  this.vector = vec3.create();
}

LD.Sprite3DRenderer.CUBE_VERTICES = [-0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,
                                        0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,
                                        0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5,  0.5,
                                        0.5, -0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,
                                        0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5, -0.5,  0.5,
                                       -0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
                                       -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5, -0.5, -0.5,
                                       -0.5, -0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5,
                                       -0.5, -0.5,  0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,
                                       -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5,
                                       -0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5, -0.5,
                                       -0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5];

LD.Sprite3DRenderer.prototype.render = function(voxelMap, size, scale, offset, projection, eye, modelview) {
  var gl = this.gl;
  size = size || 8;
  size = (size instanceof Array) ? size : [size, size, size];
  mat4.invert(this.matrix, modelview);
  vec3.transformMat4(this.vector, eye, this.matrix);
  mat4.multiply(this.matrix, projection, modelview);
  voxelMap.use(gl.TEXTURE0);
  voxelToTexelMatrix = [scale[0] / size[0] / size[2], 0.0, 0.0, 0.0,
                        0.0, -scale[1] / size[1], 0.0, 0.0,
                        -scale[0] / size[2], 0.0, 0.0, 0.0,
                        scale[0] * ((0.5 / size[0] - 0.5) / size[2] + 0.5) + offset[0], scale[1] * (-0.5 / size[1] + 0.5) + offset[1], 0.0, 1.0];
  this.program.use({matrix: this.matrix,
                    rayOrigin: this.vector,
                    size: size,
                    voxelToTexelMatrix: voxelToTexelMatrix,
                    voxelMap: 0},
                   {pos: this.cubeVertices});
  gl.drawArrays(gl.TRIANGLES, 0, LD.Sprite3DRenderer.CUBE_VERTICES.length / 3);
}

LD.Sprite3D = function(voxelMap, size, scale, offset, modelview, animation) {
  if (arguments.length > 0) {
    this.voxelMap = voxelMap;
    this.size = size || 8;
    this.scale = scale || [1, 1];
    this.offset = offset || [0, 0];
    this.modelview = modelview || mat4.create();
    this.animation = animation || mat4.create();
    this.matrix = mat4.create();
  }
}

LD.Sprite3D.init = function(sprite3dRenderer) {
  LD.Sprite3D.sprite3dRenderer = sprite3dRenderer;
}

LD.Sprite3D.prototype.ticked = function(tick) {
  mat4.identity(this.animation);
}

LD.Sprite3D.prototype.render = function(projection, eye) {
  mat4.multiply(this.matrix, this.modelview, this.animation);
  LD.Sprite3D.sprite3dRenderer.render(this.voxelMap, this.size, this.scale, this.offset, projection, eye, this.matrix);
}

LD.ShadowRenderer = function(gl) {
  this.gl = gl;
  this.program = new GL.Program(
    gl,
    ["uniform mat4 projection;",
     "uniform mat4 modelview;",
     "uniform highp float y;",
     "attribute vec3 pos;",
     "varying lowp vec3 pos2;",
     "void main() {",
     "  vec4 pos3 = modelview * vec4(pos, 1);",
     "  pos3.y = y;",
     "  gl_Position = projection * pos3;",
     "  pos2 = pos;",
     "}"],
    ["varying lowp vec3 pos2;",
     "void main() {",
     "  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0) * smoothstep(0.0, 1.0, 1.0 - 2.0 * length(pos2));",
     "}"]);
  if (!LD.ShadowRenderer.SHADOW_VERTICES) {
    var vertices = [-0.5, 0, -0.5, -0.5, 0,  0.5,  0.5, 0, -0.5,
                     0.5, 0, -0.5, -0.5, 0,  0.5,  0.5, 0,  0.5];
    LD.ShadowRenderer.SHADOW_VERTICES = vertices;
  }
  this.shadowVertices = new GL.StaticBuffer(this.gl, LD.ShadowRenderer.SHADOW_VERTICES);
  this.matrix = mat4.create();
}

LD.ShadowRenderer.prototype.render = function(projection, modelview, y) {
  var gl = this.gl;
  mat4.invert(this.matrix, modelview);
  mat4.multiply(this.matrix, projection, modelview);
  this.program.use({projection: projection,
                    modelview: modelview,
                    y: y},
                   {pos: this.shadowVertices});
  gl.drawArrays(gl.TRIANGLES, 0, LD.ShadowRenderer.SHADOW_VERTICES.length / 3);
}

LD.Shadow = function(shadower, scale, y) {
  if (arguments.length > 0) {
    this.shadower = shadower;
    this.y = y;
    this.matrix = mat4.create();
    this.vector = vec4.fromValues(scale, scale, scale, scale);
  }
}

LD.Shadow.init = function(shadowRenderer) {
  LD.Shadow.shadowRenderer = shadowRenderer;
}

LD.Shadow.prototype.render = function(projection, eye) {
  mat4.scale(this.matrix, this.shadower.modelview, this.vector);
  LD.Shadow.shadowRenderer.render(projection, this.matrix, this.y);
}

LD.BackgroundRenderer = function(gl) {
  this.gl = gl;
  this.program = new GL.Program(
    gl,
    ["attribute vec2 pos;",
     "void main() {",
     "  gl_Position = vec4(pos, 1, 1);",
     "}"],
    ["void main() {",
     "  gl_FragColor = vec4(0.25 + 0.25 * vec3(abs(dot(step(16.0, mod(gl_FragCoord.xy, 32.0)), vec2(1.0, -1.0)))), 1);",
     "  return;",
     "}"]);
  this.backgroundVertices = new GL.StaticBuffer(this.gl, LD.BackgroundRenderer.BACKGROUND_VERTICES);
}

LD.BackgroundRenderer.BACKGROUND_VERTICES = [-1.0, -1.0,  1.0, -1.0, -1.0,  1.0,
                                                 -1.0,  1.0,  1.0, -1.0,  1.0,  1.0];

LD.BackgroundRenderer.prototype.render = function() {
  var gl = this.gl;
  gl.disable(gl.DEPTH_TEST);
  this.program.use({},
                   {pos: this.backgroundVertices});
  gl.drawArrays(gl.TRIANGLES, 0, LD.BackgroundRenderer.BACKGROUND_VERTICES.length / 2);
  gl.enable(gl.DEPTH_TEST);
}

LD.SheetRenderer = function(gl) {
  this.gl = gl;
  this.program = new GL.Program(
    gl,
    ["uniform mat4 matrix;",
     "uniform mat3 uvMatrix;",
     "attribute vec2 pos;",
     "varying lowp vec2 uv;",
     "varying lowp vec2 transformedUv;",
     "void main() {",
     "  gl_Position = matrix * vec4(pos, 0, 1);",
     "  uv = pos;",
     "  transformedUv = (uvMatrix * vec3(uv, 1)).xy;",
     "}"],
    ["uniform sampler2D sheetMap;",
     "varying lowp vec2 uv;",
     "varying lowp vec2 transformedUv;",
     "void main() {",
     "  lowp vec4 color = texture2D(sheetMap, transformedUv);",
     "  if (color.a == 0.0) {",
     "    color = vec4(1.0, 1.0, 1.0, clamp(8.0 * max(abs(uv.x), abs(uv.y)) - 7.0, 0.0, 1.0));",
     "  }",
     "  gl_FragColor = color;",
     "  return;",
     "}"]);
  this.vertices = new GL.StaticBuffer(this.gl, LD.SheetRenderer.VERTICES);
  this.matrix = mat4.create();
}

LD.SheetRenderer.VERTICES = [-1.0, -1.0,  1.0, -1.0, -1.0,  1.0,
                             -1.0,  1.0,  1.0, -1.0,  1.0,  1.0];

LD.SheetRenderer.prototype.render = function(sheetMap, projection, modelview, uvMatrix) {
  var gl = this.gl;
  gl.enable(gl.BLEND);
  mat4.multiply(this.matrix, projection, modelview);
  sheetMap.use(gl.TEXTURE0);
  this.program.use({matrix: this.matrix,
	            uvMatrix: uvMatrix,
	            sheetMap: 0},
                   {pos: this.vertices});
  gl.drawArrays(gl.TRIANGLES, 0, LD.SheetRenderer.VERTICES.length / 2);
  gl.disable(gl.BLEND);
}

LD.SheetRenderer.prototype.pick = function(projection, modelview, point) {
  var vertices = [vec4.fromValues(-1.0, -1.0, 0.0, 1.0),
                  vec4.fromValues( 1.0, -1.0, 0.0, 1.0),
                  vec4.fromValues( 1.0,  1.0, 0.0, 1.0),
                  vec4.fromValues(-1.0,  1.0, 0.0, 1.0)];
  var projectedVertices = LD.Utils.projectVertices(projection, modelview, vertices);
  point = vec2.fromValues(point[0], point[1]);
  var pickCoord;
  if (LD.Utils.insideConvexPlanarPolygon(point, projectedVertices)) {
    var point1ToPickPoint = vec2.create();
    vec2.subtract(point1ToPickPoint, point, projectedVertices[0]);
    var point12 = vec2.create();
    vec2.subtract(point12, projectedVertices[1], projectedVertices[0]);
    var point14 = vec2.create();
    vec2.subtract(point14, projectedVertices[3], projectedVertices[0]);
    pickCoord = vec2.fromValues(vec2.dot(point1ToPickPoint, point12) / Math.pow(vec2.length(point12), 2), vec2.dot(point1ToPickPoint, point14) / Math.pow(vec2.length(point14), 2));
  }
  return pickCoord;
}

LD.Sheet = function(sheetMap, uvMatrix, modelview, animation) {
  if (arguments.length > 0) {
    this.sheetMap = sheetMap;
    this.uvMatrix = uvMatrix || mat3.create();
    this.modelview = modelview || mat4.create();
    this.animation = animation || mat4.create();
    this.matrix = mat4.create();
  }
}

LD.Sheet.init = function(sheetRenderer) {
  LD.Sheet.sheetRenderer = sheetRenderer;
}

LD.Sheet.prototype.ticked = function(tick) {
  mat4.identity(this.animation);
}

LD.Sheet.prototype.render = function(projection) {
  mat4.multiply(this.matrix, this.modelview, this.animation);
  LD.Sheet.sheetRenderer.render(this.sheetMap, projection, this.matrix, this.uvMatrix);
}

LD.Sheet.prototype.pick = function(projection, pickPoint) {
  return LD.Sheet.sheetRenderer.pick(projection, this.matrix, pickPoint);
}

LD.VoxelSheet = function(voxelMap, z, size, modelview, animation) {
  if (arguments.length > 0) {
    this.z = z || 0;
    this.size = size || 8;
    LD.Sheet.call(this,
                  voxelMap,
                  [               0.5 / this.size,  0.0, 0.0,
                                              0.0, -0.5, 0.0,
                   1 - (this.z + 0.5) / this.size,  0.5, 1.0],
                  modelview,
                  animation);
  }
}
LD.VoxelSheet.prototype = new LD.Sheet();

LD.VoxelSheet.prototype.pick = function(projection, pickPoint) {
  var pickCoord = LD.Sheet.prototype.pick.call(this, projection, pickPoint);
  if (pickCoord) {
    pickCoord = vec3.fromValues(Math.floor(pickCoord[0] * this.size), Math.floor(pickCoord[1] * this.size), this.z);
  }
  return pickCoord;
}

LD.EditableSprite3D = function(size) {
  size = size || 8;
  this.canvas = new LD.VoxelCanvas(size);
  this.voxelMap = new GL.Texture(LD.Sprite3D.sprite3dRenderer.gl, this.canvas.getCanvas());
  LD.Sprite3D.call(this, this.voxelMap, size);
  this.rotation = mat4.create();
  mat4.translate(this.modelview, this.modelview, [-0.5, 0, -5]);
  this.voxelSheets = [];
  for (var z = 0; z < this.size; z++) {
    this.voxelSheets.push(new LD.VoxelSheet(this.voxelMap, z, size));
  }
}
LD.EditableSprite3D.prototype = new LD.Sprite3D();

LD.EditableSprite3D.prototype.ticked = function(tick) {
  LD.Sprite3D.prototype.ticked.call(this, tick);
  mat4.multiply(this.animation, this.animation, this.rotation);
}

LD.EditableSprite3D.prototype.setVoxel = function(x, y, z, r, g, b, a) {
  this.canvas.setVoxel(x, y, z, r, g, b, a);
  this.voxelMap.set(this.canvas.getCanvas());
}

LD.EditableSprite3D.prototype.toDataURL = function() {
  return this.canvas.toDataURL();
}

LD.Canvas = function(width, height) {
  if (arguments.length > 0) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
  }
}

LD.Canvas.prototype.setPixel = function(x, y, r, g, b, a) {
  r = (r != null) ? r : 255;
  g = (g != null) ? g : r;
  b = (b != null) ? b : r;
  a = (a != null) ? a : 255;
  var context = this.canvas.getContext("2d");
  context.fillStyle = "rgba(" + r + "," + g + "," + b + "," + a + ")";
  context.clearRect(x, y, 1, 1);
  context.fillRect(x, y, 1, 1);
}

LD.Canvas.prototype.getPixel = function(x, y) {
  var context = this.canvas.getContext("2d");
  return context.getImageData(x, y, 1, 1).data;
}

LD.Canvas.prototype.getCanvas = function() {
  return this.canvas;
}

LD.Canvas.prototype.toDataURL = function() {
  return this.canvas.toDataURL();
}

LD.VoxelCanvas = function(width, height, depth) {
  this.width = width || 8;
  this.height = height || this.width;
  this.depth = depth || this.width;
  LD.Canvas.call(this, this.width * this.depth, this.height);
}
LD.VoxelCanvas.prototype = new LD.Canvas();

LD.VoxelCanvas.prototype.setVoxel = function(x, y, z, r, g, b, a) {
  this.setPixel(x + this.width * (this.depth - z - 1), (this.height - y - 1), r, g, b, a);
}

LD.TerrainRenderer = function(gl) {
  this.gl = gl;
  this.program = new GL.Program(
    gl,
    ["uniform mat4 matrix;",
     "attribute vec3 pos;",
     "varying lowp vec3 color;",
     "varying lowp vec2 uv;",
     "void main() {",
     "  gl_Position = matrix * vec4(pos, 1);",
     "  color = vec3(pos.z * 0.5, 0.25, 0);",
     "  uv = pos.xy;",
     "}"],
    ["varying lowp vec3 color;",
     "varying lowp vec2 uv;",
     "void main() {",
     "  if (gl_FrontFacing) {",
     "    gl_FragColor = vec4(color * sin(uv.x * 8.0 * 3.141) * sin(uv.y * 8.0 * 3.141), 1);",
     "  } else {",
     "    gl_FragColor = vec4(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), 1);",
     "  }",
     "}"]);
  this.matrix = mat4.create();
}

LD.TerrainRenderer.prototype.render = function(vertices, numVertices, projection, modelview) {
  var gl = this.gl;
  mat4.multiply(this.matrix, projection, modelview);
  this.program.use({matrix: this.matrix},
                   {pos: vertices});
  gl.drawArrays(gl.TRIANGLES, 0, numVertices / 3);
}

LD.TerrainLightRenderer = function(gl) {
  this.gl = gl;
  this.program = new GL.Program(
    gl,
    ["uniform mat4 matrix;",
     "uniform vec3 lightPos;",
     "attribute vec3 pos;",
     "varying lowp vec3 light;",
     "void main() {",
     "  gl_Position = matrix * vec4(pos, 1);",
     "  light = lightPos - pos;",
     "}"],
    ["uniform lowp vec3 lightColor;",
     "uniform lowp float lightRange;",
     "varying lowp vec3 light;",
     "void main() {",
     // TODO: use normal to decide whether wall is back-facing... or store normal in vertex buffer?
     "  gl_FragColor = vec4(lightColor, 1) * (1.0 - length(light) / lightRange);",
     "}"]);
  this.matrix = mat4.create();
}

LD.TerrainLightRenderer.prototype.render = function(vertices, numVertices, projection, modelview, lightPos, lightColor, lightRange) {
  var gl = this.gl;
  mat4.multiply(this.matrix, projection, modelview);
  this.program.use({matrix: this.matrix,
	            lightPos: lightPos,
	            lightColor: lightColor,
	            lightRange: lightRange},
                   {pos: vertices});
  gl.drawArrays(gl.TRIANGLES, 0, numVertices / 3);
}

LD.TerrainChunk = function(terrain, terrainWidth, terrainHeight, modelview, animation) {
  if (arguments.length > 0) {
    this.terrainBuilder = new LD.TerrainChunkBuilder(terrain, terrainWidth, terrainHeight);
    var vertices = this.terrainBuilder.build();
    this.vertices = new GL.StaticBuffer(LD.TerrainChunk.terrainRenderer.gl, vertices);
    this.numVertices = vertices.length;
    this.modelview = modelview || mat4.create();
    this.tick = 0;
  }
}

LD.TerrainChunk.init = function(terrainRenderer, terrainLightRenderer) {
  LD.TerrainChunk.terrainRenderer = terrainRenderer;
  LD.TerrainChunk.terrainLightRenderer = terrainLightRenderer;
}

LD.TerrainChunk.prototype.ticked = function(tick) {
  this.tick = tick;
  mat4.translate(this.modelview, this.modelview, [2.5, 2.5, 0]);
  mat4.rotateZ(this.modelview, this.modelview, 0.01);
  mat4.translate(this.modelview, this.modelview, [-2.5, -2.5, 0]);
}

LD.TerrainChunk.prototype.render = function(projection) {
  LD.TerrainChunk.terrainRenderer.render(this.vertices, this.numVertices, projection, this.modelview);
  this.renderLight(projection,
                   [2 * Math.cos(this.tick * 0.01) + 2, 2 * Math.sin(this.tick * 0.023) + 2, 0.5 + 0.5 * Math.sin(this.tick * 0.017)],
                   [1, 0, 0],
                   1);
  this.renderLight(projection,
                   [2 * Math.cos(this.tick * 0.008) + 2, 2 * Math.sin(this.tick * 0.015) + 2, 0.5 + 0.5 * Math.sin(this.tick * 0.021)]
                   [0, 0, 1],
                   1);
}

LD.TerrainChunk.prototype.renderLight = function(projection, lightPos, lightColor, lightRange) {
  var gl = LD.TerrainChunk.terrainLightRenderer.gl;
  var vertices = this.terrainBuilder.build(Math.floor(lightPos[0] - lightRange), Math.floor(lightPos[1] - lightRange), 2 * lightRange + 1, 2 * lightRange + 1);
  gl.enable(gl.BLEND);
  gl.enable(gl.CULL_FACE);
  gl.depthFunc(gl.LEQUAL);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  LD.TerrainChunk.terrainLightRenderer.render(vertices, vertices.length, projection, this.modelview, lightPos, lightColor, lightRange);
  gl.depthFunc(gl.LESS);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
}

LD.TerrainChunkBuilder = function(terrain, terrainWidth, terrainHeight) {
  this.terrain = terrain;
  this.terrainWidth = terrainWidth;
  this.terrainHeight = terrainHeight;
}

LD.TerrainChunkBuilder.prototype.build = function(x, y, w, h) {
  var terrain = this.terrain;
  var terrainWidth = this.terrainWidth;
  var terrainHeight = this.terrainHeight;
  var x1 = Math.max(x || 0, 0);
  var y1 = Math.max(y || 0, 0);
  var x2 = Math.min(x1 + (w || terrainWidth), terrainWidth - 1);
  var y2 = Math.min(y1 + (h || terrainHeight), terrainHeight - 1);
  this.vertices = [];
  for (var y = y1; y < y2; y++) {
    for (var x = x1; x < x2; x++) {
      var x0y0 = {x: x,     y: y,     z: terrain[x     +       y * terrainWidth].z, cliffX: terrain[x     +       y * terrainWidth].cliffX, cliffY: terrain[x     +       y * terrainWidth].cliffY};
      var x0y1 = {x: x,     y: y + 1, z: terrain[x     + (y + 1) * terrainWidth].z, cliffX: terrain[x     + (y + 1) * terrainWidth].cliffX, cliffY: terrain[x     + (y + 1) * terrainWidth].cliffY};
      var x1y0 = {x: x + 1, y: y,     z: terrain[x + 1 +       y * terrainWidth].z, cliffX: terrain[x + 1 +       y * terrainWidth].cliffX, cliffY: terrain[x + 1 +       y * terrainWidth].cliffY};
      var x1y1 = {x: x + 1, y: y + 1, z: terrain[x + 1 + (y + 1) * terrainWidth].z, cliffX: terrain[x + 1 + (y + 1) * terrainWidth].cliffX, cliffY: terrain[x + 1 + (y + 1) * terrainWidth].cliffY};
      this.renderTile(x0y0, x0y1, x1y0, x1y1);
    }
  }
  return this.vertices;
}

LD.TerrainChunkBuilder.rotateTileData = function(x0y0, x0y1, x1y0, x1y1, rotation) {
  var verts = [x0y0, x1y0, x1y1, x0y1]; // Clockwise permutation
  verts = verts.concat(verts.splice(0, rotation));
  return {
    x0y0: verts[0], // Undo clockwise permutation
    x0y1: verts[3],
    x1y0: verts[1],
    x1y1: verts[2]
  };
}

LD.TerrainChunkBuilder.mid = function(v1, v2) {
  return {x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2, z: (v1.z + v2.z) / 2};
}

LD.TerrainChunkBuilder.slope = function(v1, v2) {
  return (v2.z - v1.z) / Math.sqrt((v2.x - v1.x) * (v2.x - v1.x) + (v2.y - v1.y) * (v2.y - v1.y));
}

LD.TerrainChunkBuilder.prototype.renderTriangle = function(v1, v2, v3) {
  this.vertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
}

LD.TerrainChunkBuilder.prototype.renderQuad = function(v1, v2, v3, v4) {
  this.renderTriangle(v1, v2, v4);
  this.renderTriangle(v4, v2, v3);
}

LD.TerrainChunkBuilder.prototype.renderHorizontalQuad = function(x0y0, x0y1, x1y0, x1y1) {
  if (Math.abs(LD.TerrainChunkBuilder.slope(x0y0, x1y1)) > Math.abs(LD.TerrainChunkBuilder.slope(x0y1, x1y0))) {
    this.renderQuad(x0y0, x1y0, x1y1, x0y1);
  } else {
    this.renderQuad(x1y0, x1y1, x0y1, x0y0);
  }
}

// +-----+
// |     |
// |     |
// |     |
// |     |
// |     |
// +-----+
LD.TerrainChunkBuilder.prototype.renderTile0000 = function(x0y0, x0y1, x1y0, x1y1) {
  this.renderHorizontalQuad(x0y0, x0y1, x1y0, x1y1);
}

// +--*--+
// |  |  |
// |  |  |
// |  |  |
// |  |  |
// |  |  |
// +-----+
LD.TerrainChunkBuilder.prototype.renderTile0001 = function(x0y0, x0y1, x1y0, x1y1) {
  var y0mid = LD.TerrainChunkBuilder.mid(x0y0, x1y0);
  var y0midx0 = {x: y0mid.x, y: y0mid.y, z: x0y0.z};
  var y0midx1 = {x: y0mid.x, y: y0mid.y, z: x1y0.z};
  var y1mid = LD.TerrainChunkBuilder.mid(x0y1, x1y1);
  this.renderHorizontalQuad(x0y0, x0y1, y0midx0, y1mid);
  this.renderHorizontalQuad(y0midx1, y1mid, x1y0, x1y1);
  this.renderTriangle(y0midx0, y0midx1, y1mid);
}

// +--*--+
// |   \ |
// |    \|
// |     *
// |     |
// |     |
// +-----+
LD.TerrainChunkBuilder.prototype.renderTile0011 = function(x0y0, x0y1, x1y0, x1y1) {
  var y0mid = LD.TerrainChunkBuilder.mid(x0y0, x1y0);
  var y0midx0 = {x: y0mid.x, y: y0mid.y, z: x0y0.z};
  var y0midx1 = {x: y0mid.x, y: y0mid.y, z: x1y0.z};
  var x1mid = LD.TerrainChunkBuilder.mid(x1y0, x1y1);
  var x1midy0 = {x: x1mid.x, y: x1mid.y, z: x1y0.z};
  var x1midy1 = {x: x1mid.x, y: x1mid.y, z: x1y1.z};
  this.renderTriangle(x1y0, x1midy0, y0midx1);
  this.renderQuad(y0midx1, x1midy0, x1midy1, y0midx0);
  this.renderTriangle(x0y1, x0y0, x1y1);
  // TODO: Use renderHorizontalQuad?
  if (Math.abs(LD.TerrainChunkBuilder.slope(x0y0, x1midy1)) > Math.abs(LD.TerrainChunkBuilder.slope(x1y1, y0midx0))) {
    this.renderTriangle(x0y0, y0midx0, x1y1);
    this.renderTriangle(x1y1, y0midx0, x1midy1);
  } else {
    this.renderTriangle(x1y1, x0y0, x1midy1);
    this.renderTriangle(x1midy1, x0y0, y0midx0);
  }
}

// +--*--+
// |  |  |
// |  |  |
// |  |  |
// |  |  |
// |  |  |
// +--*--+
LD.TerrainChunkBuilder.prototype.renderTile0101 = function(x0y0, x0y1, x1y0, x1y1) {
  var y0mid = LD.TerrainChunkBuilder.mid(x0y0, x1y0);
  var y0midx0 = {x: y0mid.x, y: y0mid.y, z: x0y0.z};
  var y0midx1 = {x: y0mid.x, y: y0mid.y, z: x1y0.z};
  var y1mid = LD.TerrainChunkBuilder.mid(x0y1, x1y1);
  var y1midx0 = {x: y1mid.x, y: y1mid.y, z: x0y1.z};
  var y1midx1 = {x: y1mid.x, y: y1mid.y, z: x1y1.z};
  this.renderHorizontalQuad(x0y0, x0y1, y0midx0, y1midx0);
  this.renderQuad(y0midx1, y1midx1, y1midx0, y0midx0);
  this.renderHorizontalQuad(y0midx1, y1midx1, x1y0,  x1y1);
}

// +--*--+    +--*--+
// |  |  |    |  |\ |
// |  |  |    |  | \|
// |  |  * or |  |  *
// |  | /|    |  |  |
// |  |/ |    |  |  |
// +--*--+    +--*--+
LD.TerrainChunkBuilder.prototype.renderTile0111 = function(x0y0, x0y1, x1y0, x1y1) {
  var y0mid = LD.TerrainChunkBuilder.mid(x0y0, x1y0);
  var y0midx0 = {x: y0mid.x, y: y0mid.y, z: x0y0.z};
  var y0midx1 = {x: y0mid.x, y: y0mid.y, z: x1y0.z};
  var x1mid = LD.TerrainChunkBuilder.mid(x1y0, x1y1);
  var x1midy0 = {x: x1mid.x, y: x1mid.y, z: x1y0.z};
  var x1midy1 = {x: x1mid.x, y: x1mid.y, z: x1y1.z};
  var y1mid = LD.TerrainChunkBuilder.mid(x0y1, x1y1);
  var y1midx0 = {x: y1mid.x, y: y1mid.y, z: x0y1.z};
  var y1midx1 = {x: y1mid.x, y: y1mid.y, z: x1y1.z};
  var x0mid = LD.TerrainChunkBuilder.mid(x0y0, x0y1);
  this.renderHorizontalQuad(x0y0, x0y1, y0midx0, y1midx0);
  var compareMap = ((x0mid.z > x1y1.z) ? 4 : 0) | ((x0mid.z > x1y0.z) ? 2 : 0) | ((x1y0.z > x1y1.z) ? 1 : 0);
  switch (compareMap) {
    case 0: // 000b - x1y1 >= x1y0 >= x0
    case 2: // 010b - x1y1 >=  x0  >  x1y0
    case 7: // 111b -  x0  >  x1y0 >  x1y1
      // +--*--+
      // |  |  |
      // |  |  |
      // |  |  *
      // |  | /|
      // |  |/ |
      // +--*--+
      var y1midx1y0 = {x: y1mid.x, y: y1mid.y, z: x1y0.z};
      this.renderQuad(y0midx0, y0midx1, y1midx1y0, y1midx0);
      this.renderQuad(y0midx1, x1y0, x1midy0, y1midx1y0);
      if (x1y1.z > x1y0.z) {
        // x1y1 is a peak
        this.renderQuad(x1midy1, y1midx1, y1midx1y0, x1midy0);
      } else {
        // x1y1 is a valley
        this.renderQuad(y1midx1y0, x1midy0, x1midy1, y1midx1);
      }
      this.renderTriangle(y1midx1, x1midy1, x1y1);
      break;

    case 1: // 001b - x1y0 >= x1y1 >= x0
    case 5: // 101b - x1y0 >=  x0  >  x1y1
    case 6: // 110b -  x0  >  x1y1 >= x1y0
      // +--*--+
      // |  |\ |
      // |  | \|
      // |  |  *
      // |  |  |
      // |  |  |
      // +--*--+
      var y0midx1y1 = {x: y0mid.x, y: y0mid.y, z: x1y1.z};
      this.renderQuad(y0midx0, y0midx1y1, y1midx1, y1midx0);
      this.renderQuad(y0midx1y1, x1midy1, x1y1, y1midx1);
      if (x1y0.z > x1y1.z) {
        // x1y0 is a peak
        this.renderQuad(y0midx1, x1midy0, x1midy1, y0midx1y1);
      } else {
        // x1y0 is a valley
        this.renderQuad(x1midy1, y0midx1y1, y0midx1, x1midy0);
      }
      this.renderTriangle(x1midy0, y0midx1, x1y0);
      break;

    case 3: // 011b - x1y1 >=  x0  >  x1y0 but x1y0 > x1y1 (impossible!)
    case 4: // 100b -  x0  >  x1y1 >= x1y0 but x1y0 >= x0  (impossible!)
      break;
  }
}

// +--*--+    +--*--+
// | /   |    |   \ |
// |/    |    |    \|
// *     * or *     *
// |    /|    |\    |
// |   / |    | \   |
// +--*--+    +--*--+
LD.TerrainChunkBuilder.prototype.renderTile1111 = function(x0y0, x0y1, x1y0, x1y1) {
  if (Math.abs(LD.TerrainChunkBuilder.slope(x0y0, x1y1)) > Math.abs(LD.TerrainChunkBuilder.slope(x0y1, x1y0))) {
    var temp = x0y0;
    x0y0 = x0y1;
    x0y1 = x1y1;
    x1y1 = x1y0;
    x1y0 = temp;
  }
  // +--*--+
  // |   \ |
  // |    \|
  // *     *
  // |\    |
  // | \   |
  // +--*--+
  var y0mid = LD.TerrainChunkBuilder.mid(x0y0, x1y0);
  var y0midx0 = {x: y0mid.x, y: y0mid.y, z: x0y0.z};
  var y0midx1 = {x: y0mid.x, y: y0mid.y, z: x1y0.z};
  var x1mid = LD.TerrainChunkBuilder.mid(x1y0, x1y1);
  var x1midy0 = {x: x1mid.x, y: x1mid.y, z: x1y0.z};
  var x1midy1 = {x: x1mid.x, y: x1mid.y, z: x1y1.z};
  var y1mid = LD.TerrainChunkBuilder.mid(x0y1, x1y1);
  var y1midx0 = {x: y1mid.x, y: y1mid.y, z: x0y1.z};
  var y1midx1 = {x: y1mid.x, y: y1mid.y, z: x1y1.z};
  var x0mid = LD.TerrainChunkBuilder.mid(x0y0, x0y1);
  var x0midy0 = {x: x0mid.x, y: x0mid.y, z: x0y0.z};
  var x0midy1 = {x: x0mid.x, y: x0mid.y, z: x0y1.z};
  this.renderTriangle(x0y1, x0midy1, y1midx0);
  if (x0y1 > (x0midy0.z + y1midx1.z) / 2) {
    // x0y1 is a peak
    this.renderQuad(y1midx0, x0midy1, x0midy0, y1midx1);
  } else {
    // x0y1 is a valley
    this.renderQuad(x0midy0, y1midx1, y1midx0, x0midy1);
  }
  this.renderTriangle(x0y0, y0midx0, x0midy0);
  this.renderQuad(x0midy0, y0midx0, x1midy1, y1midx1);
  this.renderTriangle(y1midx1, x1midy1, x1y1);
  if (x1y0 > (x1midy1.z + y0midx0.z) / 2) {
    // x1y0 is a peak
    this.renderQuad(y0midx1, x1midy0, x1midy1, y0midx0);
  } else {
    // x1y0 is a valley
    this.renderQuad(x1midy1, y0midx0, y0midx1, x1midy0);
  }
  this.renderTriangle(x1midy0, y0midx1, x1y0);
}

LD.TerrainChunkBuilder.prototype.renderTile = function(x0y0, x0y1, x1y0, x1y1) {
  var cliffMap = (x0y0.cliffX ? 1 : 0) | (x1y0.cliffY ? 2 : 0) | (x0y1.cliffX ? 4 : 0) | (x0y0.cliffY ? 8 : 0);
  var rotation = 0;
  switch (cliffMap) {
    case 0:  // 0000b
      this.renderTile0000(x0y0, x0y1, x1y0, x1y1);
      break;

    case 1:  // 0001b
      rotation--;
    case 2:  // 0010b
      rotation--;
    case 4:  // 0100b
      rotation--;
    case 8:  // 1000b
      rotation += 3;
      var rotated = LD.TerrainChunkBuilder.rotateTileData(x0y0, x0y1, x1y0, x1y1, rotation);
      this.renderTile0001(rotated.x0y0, rotated.x0y1, rotated.x1y0, rotated.x1y1);
      break;

    case 3:  // 0011b
      rotation--;
    case 6:  // 0110b
      rotation--;
    case 12: // 1100b
      rotation--;
    case 9:  // 1001b
      rotation += 3;
      var rotated = LD.TerrainChunkBuilder.rotateTileData(x0y0, x0y1, x1y0, x1y1, rotation);
      this.renderTile0011(rotated.x0y0, rotated.x0y1, rotated.x1y0, rotated.x1y1);
      break;

    case 5:  // 0101b
      rotation--;
    case 10: // 1010b
      rotation++;
      var rotated = LD.TerrainChunkBuilder.rotateTileData(x0y0, x0y1, x1y0, x1y1, rotation);
      this.renderTile0101(rotated.x0y0, rotated.x0y1, rotated.x1y0, rotated.x1y1);
      break;

    case 7:  // 0111b
      rotation--;
    case 14: // 1110b
      rotation--;
    case 13: // 1101b
      rotation--;
    case 11: // 1011b
      rotation += 3;
      var rotated = LD.TerrainChunkBuilder.rotateTileData(x0y0, x0y1, x1y0, x1y1, rotation);
      this.renderTile0111(rotated.x0y0, rotated.x0y1, rotated.x1y0, rotated.x1y1);
      break;
    
    case 15: // 1111b
      this.renderTile1111(x0y0, x0y1, x1y0, x1y1);
      break;
  }
}
