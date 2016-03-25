LD.Utils = {
  matrix: mat4.create(),

  projectVertices: function(projection, modelview, vertices) {
    var matrix = LD.Utils.matrix;
    mat4.multiply(matrix, projection, modelview);
    var projectedVertices = [];
    for (var ii = 0; ii < vertices.length; ii++) {
      var vertex = vec4.fromValues(vertices[ii][0], vertices[ii][1], vertices[ii][2], 1.0);
      vec4.transformMat4(vertex, vertex, this.matrix);
      projectedVertices.push(vec2.fromValues(vertex[0] / vertex[3], vertex[1] / vertex[3]));
    }
    return projectedVertices;
  },
  
  insideConvexPlanarPolygon: function(point, projectedVertices) {
    point = vec2.fromValues(point[0], point[1]);
    var centroid = vec2.create();
    for (var ii = 0; ii < projectedVertices.length; ii++) {
      vec2.add(centroid, centroid, projectedVertices[ii]);
    }
    vec2.scale(centroid, centroid, 1.0 / projectedVertices.length);
    var centroidToPoint = vec2.create();
    vec2.subtract(centroidToPoint, point, centroid);
    var inside = true;
    for (var ii = 0; ii < projectedVertices.length; ii++) {
      var vertex1 = projectedVertices[ii];
      var vertex2 = projectedVertices[(ii + 1) % projectedVertices.length];
      var vector12 = vec2.create();
      vec2.subtract(vector12, vertex2, vertex1);
      var normal12 = vec2.create();
      vec2.normalize(normal12, vec2.fromValues(vector12[1], -vector12[0]));
      var centroidToVertex1 = vec2.create();
      vec2.subtract(centroidToVertex1, vertex1, centroid);
      inside = inside && (vec2.dot(normal12, centroidToPoint) < vec2.dot(normal12, centroidToVertex1));
    }
    return inside;
  }
};
