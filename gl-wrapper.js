GL = {};

GL.Texture = function(gl, canvasOrUrl) {
  this.gl = gl;
  this.id = gl.createTexture();
  if (canvasOrUrl instanceof Element) {
    var canvas = canvasOrUrl;
    this.set(canvas);
  } else {
    var url = canvasOrUrl;
    var image = new Image();
    var otherThis = this;
    image.onload = function() { otherThis.set(image); }
    image.src = url;
  }
}

GL.Texture.prototype.set = function(image) {
  var gl = this.gl;
  gl.bindTexture(gl.TEXTURE_2D, this.id);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

GL.Texture.prototype.use = function(channel) {
  var gl = this.gl;
  channel = (channel) ? channel : gl.TEXTURE0;
  gl.activeTexture(channel);
  this.gl.bindTexture(gl.TEXTURE_2D, this.id);
}

GL.Shader = function(gl, type, src) {
  if (arguments.length > 0)
  {
    this.gl = gl;
    var id = gl.createShader(type);
    gl.shaderSource(id, (src instanceof Array) ? src.join("\n") : src);
    gl.compileShader(id);
    if (!gl.getShaderParameter(id, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(id));
    }
    this.id = id;
  }
}

GL.VertexShader = function(gl, src) {
  GL.Shader.call(this, gl, gl.VERTEX_SHADER, src);
}
GL.VertexShader.prototype = new GL.Shader();

GL.FragmentShader = function(gl, src) {
  GL.Shader.call(this, gl, gl.FRAGMENT_SHADER, src);
}
GL.FragmentShader.prototype = new GL.Shader();

GL.Program = function(gl, vertexShader, fragmentShader) {
  this.gl = gl;
  var id = gl.createProgram();
  vertexShader = (vertexShader instanceof GL.Shader) ? vertexShader  : new GL.VertexShader(gl, vertexShader);
  fragmentShader = (fragmentShader instanceof GL.Shader) ? fragmentShader : new GL.FragmentShader(gl, fragmentShader); 
  gl.attachShader(id, vertexShader.id);
  gl.attachShader(id, fragmentShader.id);
  gl.linkProgram(id);
  if (!this.gl.getProgramParameter(id, gl.LINK_STATUS)) {
    console.error(this.gl.getProgramInfoLog(id));
  }
  this.id = id;

  this.uniforms = {};
  var numUniforms = gl.getProgramParameter(id, gl.ACTIVE_UNIFORMS);
  for (var uniformIndex = 0; uniformIndex < numUniforms; uniformIndex++) {
    var uniform = gl.getActiveUniform(id, uniformIndex);
    var uniformName = uniform.name.replace(/\[[0-9]+\]$/, "");
    var location = gl.getUniformLocation(id, uniformName);
    this.uniforms[uniformName] = {location: location, type: uniform.type};
  }
  this.attributes = {};
  var numAttributes = gl.getProgramParameter(id, gl.ACTIVE_ATTRIBUTES);
  for (var attributeIndex = 0; attributeIndex < numAttributes; attributeIndex++) {
    var attribute = gl.getActiveAttrib(this.id, attributeIndex);
    var attributeName = attribute.name.replace(/\[[0-9]+\]$/, "");
    var location = gl.getAttribLocation(id, attributeName);
    this.attributes[attributeName] = {location: location, type: attribute.type};
  }
}

GL.Program.prototype.use = function(uniforms, attributes) {
  var gl = this.gl;
  var id = this.id;
  if (GL.Program.id != id) {
    gl.useProgram(id);
  }
  for (var uniformName in this.uniforms) {
    var value = uniforms[uniformName];
    if (value != null) {
      value = ((value instanceof Array) || (value instanceof Int32Array) || (value instanceof Float32Array)) ? value : [value];
      var uniform = this.uniforms[uniformName];
      var location = uniform.location;
      switch (uniform.type) {
        case gl.BOOL:
        case gl.INT:
        case gl.SAMPLER_2D:
        case gl.SAMPLER_CUBE:
          gl.uniform1iv(location, (value instanceof Int32Array) ? value : new Int32Array(value));
          break;
        case gl.FLOAT:
          gl.uniform1fv(location, (value instanceof Float32Array) ? value : new Float32Array(value));
          break;
        case gl.BOOL_VEC2:
        case gl.INT_VEC2:
          gl.uniform2iv(location, (value instanceof Int32Array) ? value : new Int32Array(value));
          break;
        case gl.FLOAT_VEC2:
          gl.uniform2fv(location, (value instanceof Float32Array) ? value : new Float32Array(value));
          break;
        case gl.BOOL_VEC3:
        case gl.INT_VEC3:
          gl.uniform3iv(location, (value instanceof Int32Array) ? value : new Int32Array(value));
          break;
        case gl.FLOAT_VEC3:
          gl.uniform3fv(location, (value instanceof Float32Array) ? value : new Float32Array(value));
          break;
        case gl.BOOL_VEC4:
        case gl.INT_VEC4:
          gl.uniform4iv(location, (value instanceof Int32Array) ? value : new Int32Array(value));
          break;
        case gl.FLOAT_VEC4:
          gl.uniform4fv(location, (value instanceof Float32Array) ? value : new Float32Array(value));
          break;
        case gl.FLOAT_MAT2:
          gl.uniformMatrix2fv(location, false, (value instanceof Float32Array) ? value : new Float32Array(value));
          break;
        case gl.FLOAT_MAT3:
          gl.uniformMatrix3fv(location, false, (value instanceof Float32Array) ? value : new Float32Array(value));
          break;
        case gl.FLOAT_MAT4:
          gl.uniformMatrix4fv(location, false, (value instanceof Float32Array) ? value : new Float32Array(value));
          break;
      }
    } else {
      console.error("No value for uniform " + uniformName);
    }
  }
  for (var attributeName in this.attributes) {
    var value = attributes[attributeName];
    if (value != null) {
      value = (value instanceof GL.Buffer) ? value : new GL.DynamicBuffer(gl, value);
      gl.bindBuffer(gl.ARRAY_BUFFER, value.id);
      var attribute = this.attributes[attributeName];
      var location = attribute.location;
      gl.enableVertexAttribArray(location);
      switch (attribute.type) {
        case gl.FLOAT:
          gl.vertexAttribPointer(location, 1, gl.FLOAT, false, 0, 0); 
          break;
        case gl.FLOAT_VEC2:
          gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0); 
          break;
        case gl.FLOAT_VEC3:
          gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0); 
          break;
        case gl.FLOAT_VEC4:
          gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 0, 0); 
          break;
      }
    } else {
      console.error("No value for attribute " + attributeName);
    }
  }
}

GL.Buffer = function(gl, type, value) {
  if (arguments.length > 0) {
    this.gl = gl;
    this.type = type;
    this.id = gl.createBuffer();
    this.set(value);
  }
}

GL.Buffer.prototype.set = function(value) {
  value = ((value instanceof Array) || (value instanceof Float32Array)) ? value : [value];
  value = (value instanceof Float32Array) ? value : new Float32Array(value);
  var gl = this.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, this.id);
  gl.bufferData(gl.ARRAY_BUFFER, value, this.type);
}

GL.StaticBuffer = function(gl, value) {
  GL.Buffer.call(this, gl, gl.STATIC_DRAW, value);
}
GL.StaticBuffer.prototype = new GL.Buffer();

GL.DynamicBuffer = function(gl, value) {
  GL.Buffer.call(this, gl, gl.DYNAMIC_DRAW, value);
}
GL.DynamicBuffer.prototype = new GL.Buffer();

