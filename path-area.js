/**
 * @description SVG隞餅�誩㦛敶Ｗ�俰ath頝臬����𢒰蝘航恣蝞埈䲮瘜�
 * @author zhangxinxu(.com) 2020-06-03
 * @docs https://www.zhangxinxu.com/wordpress/?p=9443
 * @base https://github.com/convertSvg/convertPath/blob/master/lib/filter/convertShapeToPath.js
 *       https://github.com/egorbunov/area-calc
 * @license MIT 雿𡏭�����枂憭�靽萘��
 */

let getPathArea = (function () {

    document.body.insertAdjacentHTML('beforeend', `<svg style="position:absolute;visibility:hidden;">
  <path id="pathForArea" d=""/>
</svg>`);

    const elePath = document.getElementById('pathForArea');

    // 頝臬�頧砍�朞器敶�
    function pathToPolygon (num) {
        num = num || 200;

        var len = elePath.getTotalLength();
        var points = [];

        for (var i=0; i < num; i++) {
            var pt = elePath.getPointAtLength(i * len / (num - 1));
            points.push([pt.x, pt.y]);
        }

        return points;
    };

    function getArea(poly) {
        const points = [].concat(...poly);

        const ears = earcut(points);

        let area = 0;
        for (let i = 0; i < ears.length; i += 3) {
            area += triangleArea(points, ears[i], ears[i+1], ears[i+2]);
        }

        return area;
    }

    function triangleArea(flatPs, idxA, idxB, idxC) {
        const ia = idxA * 2;
        const ib = idxB * 2;
        const ic = idxC * 2;

        const a = len(flatPs[ia], flatPs[ia+1], flatPs[ib], flatPs[ib+1]);
        const b = len(flatPs[ib], flatPs[ib+1], flatPs[ic], flatPs[ic+1]);
        const c = len(flatPs[ic], flatPs[ic+1], flatPs[ia], flatPs[ia+1]);

        const p = (a + b + c) / 2;

        return Math.sqrt(p * (p - a) * (p - b) * (p - c));
    }

    function len(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    }


    function earcut(data, holeIndices, dim) {

        dim = dim || 2;

        var hasHoles = holeIndices && holeIndices.length,
            outerLen = hasHoles ? holeIndices[0] * dim : data.length,
            outerNode = linkedList(data, 0, outerLen, dim, true),
            triangles = [];

        if (!outerNode) return triangles;

        var minX, minY, maxX, maxY, x, y, invSize;

        if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);

        // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
        if (data.length > 80 * dim) {
            minX = maxX = data[0];
            minY = maxY = data[1];

            for (var i = dim; i < outerLen; i += dim) {
                x = data[i];
                y = data[i + 1];
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }

            // minX, minY and invSize are later used to transform coords into integers for z-order calculation
            invSize = Math.max(maxX - minX, maxY - minY);
            invSize = invSize !== 0 ? 1 / invSize : 0;
        }

        earcutLinked(outerNode, triangles, dim, minX, minY, invSize);

        return triangles;
    }

    // create a circular doubly linked list from polygon points in the specified winding order
    function linkedList(data, start, end, dim, clockwise) {
        var i, last;

        if (clockwise === (signedArea(data, start, end, dim) > 0)) {
            for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
        } else {
            for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
        }

        if (last && equals(last, last.next)) {
            removeNode(last);
            last = last.next;
        }

        return last;
    }

    // eliminate colinear or duplicate points
    function filterPoints(start, end) {
        if (!start) return start;
        if (!end) end = start;

        var p = start,
            again;
        do {
            again = false;

            if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
                removeNode(p);
                p = end = p.prev;
                if (p === p.next) break;
                again = true;

            } else {
                p = p.next;
            }
        } while (again || p !== end);

        return end;
    }

    // main ear slicing loop which triangulates a polygon (given as a linked list)
    function earcutLinked(ear, triangles, dim, minX, minY, invSize, pass) {
        if (!ear) return;

        // interlink polygon nodes in z-order
        if (!pass && invSize) indexCurve(ear, minX, minY, invSize);

        var stop = ear,
            prev, next;

        // iterate through ears, slicing them one by one
        while (ear.prev !== ear.next) {
            prev = ear.prev;
            next = ear.next;

            if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
                // cut off the triangle
                triangles.push(prev.i / dim);
                triangles.push(ear.i / dim);
                triangles.push(next.i / dim);

                removeNode(ear);

                // skipping the next vertice leads to less sliver triangles
                ear = next.next;
                stop = next.next;

                continue;
            }

            ear = next;

            // if we looped through the whole remaining polygon and can't find any more ears
            if (ear === stop) {
                // try filtering points and slicing again
                if (!pass) {
                    earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);

                // if this didn't work, try curing all small self-intersections locally
                } else if (pass === 1) {
                    ear = cureLocalIntersections(ear, triangles, dim);
                    earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);

                // as a last resort, try splitting the remaining polygon into two
                } else if (pass === 2) {
                    splitEarcut(ear, triangles, dim, minX, minY, invSize);
                }

                break;
            }
        }
    }

    // check whether a polygon node forms a valid ear with adjacent nodes
    function isEar(ear) {
        var a = ear.prev,
            b = ear,
            c = ear.next;

        if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

        // now make sure we don't have other points inside the potential ear
        var p = ear.next.next;

        while (p !== ear.prev) {
            if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
                area(p.prev, p, p.next) >= 0) return false;
            p = p.next;
        }

        return true;
    }

    function isEarHashed(ear, minX, minY, invSize) {
        var a = ear.prev,
            b = ear,
            c = ear.next;

        if (area(a, b, c) >= 0) return false; // reflex, can't be an ear

        // triangle bbox; min & max are calculated like this for speed
        var minTX = a.x < b.x ? (a.x < c.x ? a.x : c.x) : (b.x < c.x ? b.x : c.x),
            minTY = a.y < b.y ? (a.y < c.y ? a.y : c.y) : (b.y < c.y ? b.y : c.y),
            maxTX = a.x > b.x ? (a.x > c.x ? a.x : c.x) : (b.x > c.x ? b.x : c.x),
            maxTY = a.y > b.y ? (a.y > c.y ? a.y : c.y) : (b.y > c.y ? b.y : c.y);

        // z-order range for the current triangle bbox;
        var minZ = zOrder(minTX, minTY, minX, minY, invSize),
            maxZ = zOrder(maxTX, maxTY, minX, minY, invSize);

        // first look for points inside the triangle in increasing z-order
        var p = ear.nextZ;

        while (p && p.z <= maxZ) {
            if (p !== ear.prev && p !== ear.next &&
                pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
                area(p.prev, p, p.next) >= 0) return false;
            p = p.nextZ;
        }

        // then look for points in decreasing z-order
        p = ear.prevZ;

        while (p && p.z >= minZ) {
            if (p !== ear.prev && p !== ear.next &&
                pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) &&
                area(p.prev, p, p.next) >= 0) return false;
            p = p.prevZ;
        }

        return true;
    }

    // go through all polygon nodes and cure small local self-intersections
    function cureLocalIntersections(start, triangles, dim) {
        var p = start;
        do {
            var a = p.prev,
                b = p.next.next;

            if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {

                triangles.push(a.i / dim);
                triangles.push(p.i / dim);
                triangles.push(b.i / dim);

                // remove two nodes involved
                removeNode(p);
                removeNode(p.next);

                p = start = b;
            }
            p = p.next;
        } while (p !== start);

        return p;
    }

    // try splitting polygon into two and triangulate them independently
    function splitEarcut(start, triangles, dim, minX, minY, invSize) {
        // look for a valid diagonal that divides the polygon into two
        var a = start;
        do {
            var b = a.next.next;
            while (b !== a.prev) {
                if (a.i !== b.i && isValidDiagonal(a, b)) {
                    // split the polygon in two by the diagonal
                    var c = splitPolygon(a, b);

                    // filter colinear points around the cuts
                    a = filterPoints(a, a.next);
                    c = filterPoints(c, c.next);

                    // run earcut on each half
                    earcutLinked(a, triangles, dim, minX, minY, invSize);
                    earcutLinked(c, triangles, dim, minX, minY, invSize);
                    return;
                }
                b = b.next;
            }
            a = a.next;
        } while (a !== start);
    }

    // link every hole into the outer loop, producing a single-ring polygon without holes
    function eliminateHoles(data, holeIndices, outerNode, dim) {
        var queue = [],
            i, len, start, end, list;
        for (i = 0, len = holeIndices.length; i < len; i++) {
            start = holeIndices[i] * dim;
            end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
            list = linkedList(data, start, end, dim, false);
            if (list === list.next) list.steiner = true;
            queue.push(getLeftmost(list));
        }

        queue.sort(compareX);

        // process holes from left to right
        for (i = 0; i < queue.length; i++) {
            eliminateHole(queue[i], outerNode);
            outerNode = filterPoints(outerNode, outerNode.next);
        }

        return outerNode;
    }

    function compareX(a, b) {
        return a.x - b.x;
    }

    // find a bridge between vertices that connects hole with an outer ring and and link it
    function eliminateHole(hole, outerNode) {
        outerNode = findHoleBridge(hole, outerNode);
        if (outerNode) {
            var b = splitPolygon(outerNode, hole);
            filterPoints(b, b.next);
        }
    }

    // David Eberly's algorithm for finding a bridge between hole and outer polygon
    function findHoleBridge(hole, outerNode) {
        var p = outerNode,
            hx = hole.x,
            hy = hole.y,
            qx = -Infinity,
            m;

        // find a segment intersected by a ray from the hole's leftmost point to the left;
        // segment's endpoint with lesser x will be potential connection point
        do {
            if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
                var x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
                if (x <= hx && x > qx) {
                    qx = x;
                    if (x === hx) {
                        if (hy === p.y) return p;
                        if (hy === p.next.y) return p.next;
                    }
                    m = p.x < p.next.x ? p : p.next;
                }
            }
            p = p.next;
        } while (p !== outerNode);

        if (!m) return null;

        if (hx === qx) return m.prev; // hole touches outer segment; pick lower endpoint

        // look for points inside the triangle of hole point, segment intersection and endpoint;
        // if there are no points found, we have a valid connection;
        // otherwise choose the point of the minimum angle with the ray as connection point

        var stop = m,
            mx = m.x,
            my = m.y,
            tanMin = Infinity,
            tan;

        p = m.next;

        while (p !== stop) {
            if (hx >= p.x && p.x >= mx && hx !== p.x &&
                    pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {

                tan = Math.abs(hy - p.y) / (hx - p.x); // tangential

                if ((tan < tanMin || (tan === tanMin && p.x > m.x)) && locallyInside(p, hole)) {
                    m = p;
                    tanMin = tan;
                }
            }

            p = p.next;
        }

        return m;
    }

    // interlink polygon nodes in z-order
    function indexCurve(start, minX, minY, invSize) {
        var p = start;
        do {
            if (p.z === null) p.z = zOrder(p.x, p.y, minX, minY, invSize);
            p.prevZ = p.prev;
            p.nextZ = p.next;
            p = p.next;
        } while (p !== start);

        p.prevZ.nextZ = null;
        p.prevZ = null;

        sortLinked(p);
    }

    // Simon Tatham's linked list merge sort algorithm
    // http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
    function sortLinked(list) {
        var i, p, q, e, tail, numMerges, pSize, qSize,
            inSize = 1;

        do {
            p = list;
            list = null;
            tail = null;
            numMerges = 0;

            while (p) {
                numMerges++;
                q = p;
                pSize = 0;
                for (i = 0; i < inSize; i++) {
                    pSize++;
                    q = q.nextZ;
                    if (!q) break;
                }
                qSize = inSize;

                while (pSize > 0 || (qSize > 0 && q)) {

                    if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
                        e = p;
                        p = p.nextZ;
                        pSize--;
                    } else {
                        e = q;
                        q = q.nextZ;
                        qSize--;
                    }

                    if (tail) tail.nextZ = e;
                    else list = e;

                    e.prevZ = tail;
                    tail = e;
                }

                p = q;
            }

            tail.nextZ = null;
            inSize *= 2;

        } while (numMerges > 1);

        return list;
    }

    // z-order of a point given coords and inverse of the longer side of data bbox
    function zOrder(x, y, minX, minY, invSize) {
        // coords are transformed into non-negative 15-bit integer range
        x = 32767 * (x - minX) * invSize;
        y = 32767 * (y - minY) * invSize;

        x = (x | (x << 8)) & 0x00FF00FF;
        x = (x | (x << 4)) & 0x0F0F0F0F;
        x = (x | (x << 2)) & 0x33333333;
        x = (x | (x << 1)) & 0x55555555;

        y = (y | (y << 8)) & 0x00FF00FF;
        y = (y | (y << 4)) & 0x0F0F0F0F;
        y = (y | (y << 2)) & 0x33333333;
        y = (y | (y << 1)) & 0x55555555;

        return x | (y << 1);
    }

    // find the leftmost node of a polygon ring
    function getLeftmost(start) {
        var p = start,
            leftmost = start;
        do {
            if (p.x < leftmost.x) leftmost = p;
            p = p.next;
        } while (p !== start);

        return leftmost;
    }

    // check if a point lies within a convex triangle
    function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
        return (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0 &&
               (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0 &&
               (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0;
    }

    // check if a diagonal between two polygon nodes is valid (lies in polygon interior)
    function isValidDiagonal(a, b) {
        return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
               locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b);
    }

    // signed area of a triangle
    function area(p, q, r) {
        return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    }

    // check if two points are equal
    function equals(p1, p2) {
        return p1.x === p2.x && p1.y === p2.y;
    }

    // check if two segments intersect
    function intersects(p1, q1, p2, q2) {
        if ((equals(p1, q1) && equals(p2, q2)) ||
            (equals(p1, q2) && equals(p2, q1))) return true;
        return area(p1, q1, p2) > 0 !== area(p1, q1, q2) > 0 &&
               area(p2, q2, p1) > 0 !== area(p2, q2, q1) > 0;
    }

    // check if a polygon diagonal intersects any polygon segments
    function intersectsPolygon(a, b) {
        var p = a;
        do {
            if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
                    intersects(p, p.next, a, b)) return true;
            p = p.next;
        } while (p !== a);

        return false;
    }

    // check if a polygon diagonal is locally inside the polygon
    function locallyInside(a, b) {
        return area(a.prev, a, a.next) < 0 ?
            area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 :
            area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
    }

    // check if the middle point of a polygon diagonal is inside the polygon
    function middleInside(a, b) {
        var p = a,
            inside = false,
            px = (a.x + b.x) / 2,
            py = (a.y + b.y) / 2;
        do {
            if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
                    (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x))
                inside = !inside;
            p = p.next;
        } while (p !== a);

        return inside;
    }

    // link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
    // if one belongs to the outer ring and another to a hole, it merges it into a single ring
    function splitPolygon(a, b) {
        var a2 = new Node(a.i, a.x, a.y),
            b2 = new Node(b.i, b.x, b.y),
            an = a.next,
            bp = b.prev;

        a.next = b;
        b.prev = a;

        a2.next = an;
        an.prev = a2;

        b2.next = a2;
        a2.prev = b2;

        bp.next = b2;
        b2.prev = bp;

        return b2;
    }

    // create a node and optionally link it with previous one (in a circular doubly linked list)
    function insertNode(i, x, y, last) {
        var p = new Node(i, x, y);

        if (!last) {
            p.prev = p;
            p.next = p;

        } else {
            p.next = last.next;
            p.prev = last;
            last.next.prev = p;
            last.next = p;
        }
        return p;
    }

    function removeNode(p) {
        p.next.prev = p.prev;
        p.prev.next = p.next;

        if (p.prevZ) p.prevZ.nextZ = p.nextZ;
        if (p.nextZ) p.nextZ.prevZ = p.prevZ;
    }

    function Node(i, x, y) {
        // vertice index in coordinates array
        this.i = i;

        // vertex coordinates
        this.x = x;
        this.y = y;

        // previous and next vertice nodes in a polygon ring
        this.prev = null;
        this.next = null;

        // z-order curve value
        this.z = null;

        // previous and next nodes in z-order
        this.prevZ = null;
        this.nextZ = null;

        // indicates whether this is a steiner point
        this.steiner = false;
    }

    // return a percentage difference between the polygon area and its triangulation area;
    // used to verify correctness of triangulation
    earcut.deviation = function (data, holeIndices, dim, triangles) {
        var hasHoles = holeIndices && holeIndices.length;
        var outerLen = hasHoles ? holeIndices[0] * dim : data.length;

        var polygonArea = Math.abs(signedArea(data, 0, outerLen, dim));
        if (hasHoles) {
            for (var i = 0, len = holeIndices.length; i < len; i++) {
                var start = holeIndices[i] * dim;
                var end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
                polygonArea -= Math.abs(signedArea(data, start, end, dim));
            }
        }

        var trianglesArea = 0;
        for (i = 0; i < triangles.length; i += 3) {
            var a = triangles[i] * dim;
            var b = triangles[i + 1] * dim;
            var c = triangles[i + 2] * dim;
            trianglesArea += Math.abs(
                (data[a] - data[c]) * (data[b + 1] - data[a + 1]) -
                (data[a] - data[b]) * (data[c + 1] - data[a + 1]));
        }

        return polygonArea === 0 && trianglesArea === 0 ? 0 :
            Math.abs((trianglesArea - polygonArea) / polygonArea);
    };

    function signedArea(data, start, end, dim) {
        var sum = 0;
        for (var i = start, j = end - dim; i < end; i += dim) {
            sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
            j = i;
        }
        return sum;
    }

    // turn a polygon in a multi-dimensional array form (e.g. as in GeoJSON) into a form Earcut accepts
    earcut.flatten = function (data) {
        var dim = data[0][0].length,
            result = {vertices: [], holes: [], dimensions: dim},
            holeIndex = 0;

        for (var i = 0; i < data.length; i++) {
            for (var j = 0; j < data[i].length; j++) {
                for (var d = 0; d < dim; d++) result.vertices.push(data[i][j][d]);
            }
            if (i > 0) {
                holeIndex += data[i - 1].length;
                result.holes.push(holeIndex);
            }
        }
        return result;
    };


    const regNumber = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g

    function convertPathData (node) {
      if (!node.tagName) return
      const tagName = String(node.tagName).toLowerCase()

      switch (tagName) {
        case 'path':
            var path = node.getAttribute('d');
            break;
        case 'rect':
          const x = Number(node.getAttribute('x'))
          const y = Number(node.getAttribute('y'))
          const width = Number(node.getAttribute('width'))
          var height = Number(node.getAttribute('height'))
          /*
           * rx ��� ry ��閫���蹱糓嚗�
           * 1. 憒���𨅯�嗡葉銝�銝芾挽蝵桐蛹 0 ��坔�閫雴�滨����
           * 2. 憒���𨀣�劐�銝芣瓷��㕑挽蝵桀�坔�硋�潔蛹�𡖂銝�銝�
           * 3.rx ����憭批�潔蛹 width ��銝����, ry ����憭批�潔蛹 height ��銝����
           */
          var rx =
            Number(node.getAttribute('rx')) || Number(node.getAttribute('ry')) || 0
          var ry =
            Number(node.getAttribute('ry')) || Number(node.getAttribute('rx')) || 0

          // ��墧㺭�澆�蓥�滩恣蝞梹���敶枏捐摨血��100%��嗵宏�膄
          // if (isNaN(x - y + width - height + rx - ry)) return;

          rx = rx > width / 2 ? width / 2 : rx
          ry = ry > height / 2 ? height / 2 : ry

          // 憒���𨅯�嗡葉銝�銝芾挽蝵桐蛹 0 ��坔�閫雴�滨����
          if (rx == 0 || ry == 0) {
            // var path =
            //     'M' + x + ' ' + y +
            //     'H' + (x + width) +
            //     'V' + (y + height) +
            //     'H' + x +
            //     'z';
            var path =
              'M' + x + ' ' + y + 'h' + width + 'v' + height + 'h' + -width + 'z'
          } else {
            var path =
              'M' +
              x +
              ' ' +
              (y + ry) +
              'a' +
              rx +
              ' ' +
              ry +
              ' 0 0 1 ' +
              rx +
              ' ' +
              -ry +
              'h' +
              (width - rx - rx) +
              'a' +
              rx +
              ' ' +
              ry +
              ' 0 0 1 ' +
              rx +
              ' ' +
              ry +
              'v' +
              (height - ry - ry) +
              'a' +
              rx +
              ' ' +
              ry +
              ' 0 0 1 ' +
              -rx +
              ' ' +
              ry +
              'h' +
              (rx + rx - width) +
              'a' +
              rx +
              ' ' +
              ry +
              ' 0 0 1 ' +
              -rx +
              ' ' +
              -ry +
              'z'
          }

          break

        case 'circle':
          var cx = node.getAttribute('cx')
          var cy = node.getAttribute('cy')
          var r = node.getAttribute('r')
          var path =
            'M' +
            (cx - r) +
            ' ' +
            cy +
            'a' +
            r +
            ' ' +
            r +
            ' 0 1 0 ' +
            2 * r +
            ' 0' +
            'a' +
            r +
            ' ' +
            r +
            ' 0 1 0 ' +
            -2 * r +
            ' 0' +
            'z'

          break

        case 'ellipse':
          var cx = node.getAttribute('cx') * 1
          var cy = node.getAttribute('cy') * 1
          var rx = node.getAttribute('rx') * 1
          var ry = node.getAttribute('ry') * 1

          if (isNaN(cx - cy + rx - ry)) return
          var path =
            'M' +
            (cx - rx) +
            ' ' +
            cy +
            'a' +
            rx +
            ' ' +
            ry +
            ' 0 1 0 ' +
            2 * rx +
            ' 0' +
            'a' +
            rx +
            ' ' +
            ry +
            ' 0 1 0 ' +
            -2 * rx +
            ' 0' +
            'z'

          break

        case 'line':
          var x1 = node.getAttribute('x1')
          var y1 = node.getAttribute('y1')
          var x2 = node.getAttribute('x2')
          var y2 = node.getAttribute('y2')
          if (isNaN(x1 - y1 + (x2 - y2))) {
            return
          }

          var path = 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2

          break

        case 'polygon':
        case 'polyline': // ploygon銝簵olyline�糓銝��甅��,polygon憭朞器敶ｇ�俰olyline��条瑪
          var points = (node.getAttribute('points').match(regNumber) || []).map(
            Number
          )
          if (points.length < 4) {
            return
          }
          var path =
            'M' +
            points.slice(0, 2).join(' ') +
            'L' +
            points.slice(2).join(' ') +
            (tagName === 'polygon' ? 'z' : '')

          break
      }
      return path;
    }

    // 獲取圖層中的所有路徑元素
    function getLayerPaths(svgElement, layerId) {
        const layer = svgElement.getElementById(layerId);
        if (!layer) {
            console.warn(`找不到圖層: ${layerId}`);
            return [];
        }
        
        // 獲取圖層中所有的圖形元素
        return Array.from(layer.getElementsByTagName('*')).filter(element => {
            const tagName = element.tagName.toLowerCase();
            return ['path', 'circle', 'rect', 'ellipse', 'polygon', 'polyline'].includes(tagName);
        });
    }

    return {
        getPathArea: function (path, num, overlay) {
            if (!path) {
                return 0;
            }
            
            try {
                var tagName = path.tagName;
                var eleTarget = null;

                if (num && num.tagName) {
                    overlay = num;
                    num = 100;
                }

                if (tagName) {
                    eleTarget = path;
                    const pathData = convertPathData(path);
                    if (!pathData) {
                        console.warn('路徑轉換失敗:', path);
                        return 0;
                    }
                    path = pathData;
                }

                elePath.setAttribute('d', path);
                let poly = pathToPolygon(num || 100);

                if (!poly || poly.length < 3) {
                    console.warn('無效的多邊形點集');
                    return 0;
                }

                if (overlay && eleTarget) {
                    var bound = overlay.getBoundingClientRect();
                    var eleSvg = eleTarget.closest('svg');
                    var boundSvg = eleSvg.getBoundingClientRect();
                    
                    // 獲取圓形的中心點和半徑
                    var circle = overlay;
                    var cx = parseFloat(circle.getAttribute('cx'));
                    var cy = parseFloat(circle.getAttribute('cy'));
                    var r = parseFloat(circle.getAttribute('r'));

                    if (bound.width) {
                        poly = poly.filter(function (xy) {
                            var x = xy[0];
                            var y = xy[1];

                            // 計算點到圓心的距離
                            var dx = x - cx;
                            var dy = y - cy;
                            var distance = Math.sqrt(dx * dx + dy * dy);

                            // 檢查點是否在圓形內
                            return distance <= r;
                        });
                    }
                }

                const area = getArea(poly);
                if (isNaN(area)) {
                    console.warn('面積計算結果無效');
                    return 0;
                }
                return area;
            } catch (error) {
                console.error('面積計算出錯:', error);
                return 0;
            }
        },
        
        getLayerPaths: getLayerPaths,
        
        calculateLayerIntersection: function(svgElement) {
            // 獲取兩個圖層的所有路徑
            const layer2Paths = getLayerPaths(svgElement, '_圖層_2');  // 黃色圓形
            const layer1Paths = getLayerPaths(svgElement, '_圖層_1');  // 藍色點陣
            
            if (!layer2Paths.length || !layer1Paths.length) {
                console.warn('找不到必要的圖層或圖層為空');
                return {
                    intersectionArea: 0,
                    layer2Area: 0,
                    layer1Area: 0
                };
            }

            // 計算各圖層的總面積
            let layer2Area = 0;
            let layer1Area = 0;
            let intersectionArea = 0;

            // 計算黃色圓形的總面積
            layer2Paths.forEach(path => {
                try {
                    const area = this.getPathArea(path);
                    layer2Area += area;
                } catch (error) {
                    console.error('計算黃色圓形面積時出錯:', error);
                }
            });

            // 計算藍色點陣的總面積
            layer1Paths.forEach(path => {
                try {
                    const area = this.getPathArea(path);
                    layer1Area += area;
                } catch (error) {
                    console.error('計算藍色點陣面積時出錯:', error);
                }
            });

            // 計算交集面積
            const yellowCircle = layer2Paths[0]; // 取得黃色圓形
            layer1Paths.forEach(blueDot => {
                // 對每個藍色點與黃色圓形計算交集
                const overlap = this.getPathArea(blueDot, yellowCircle);
                intersectionArea += overlap;
            });

            return {
                intersectionArea,
                layer2Area,
                layer1Area
            };
        }
    };
})();