#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/engine/child-env.ts
import { dirname, delimiter } from "node:path";
function buildChildEnv(extra) {
  const nodeBinDir = dirname(process.execPath);
  const basePath = extra.PATH ?? process.env.PATH ?? "";
  const path = basePath ? `${nodeBinDir}${delimiter}${basePath}` : nodeBinDir;
  const stripped = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("CYCLE_"))
  );
  return { ...stripped, ...extra, PATH: path };
}
var init_child_env = __esm({
  "src/engine/child-env.ts"() {
    "use strict";
  }
});

// src/issue/id.ts
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
}
function freeformId(text, now = /* @__PURE__ */ new Date()) {
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  return `txt-${y}${mo}${d}-${h}${mi}${s}-${slugify(text)}`;
}
var init_id = __esm({
  "src/issue/id.ts"() {
    "use strict";
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = Symbol.for("yaml.alias");
    var DOC = Symbol.for("yaml.document");
    var MAP = Symbol.for("yaml.map");
    var PAIR = Symbol.for("yaml.pair");
    var SCALAR = Symbol.for("yaml.scalar");
    var SEQ = Symbol.for("yaml.seq");
    var NODE_TYPE = Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log2 = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log2.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + match[1];
          sep = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log2 = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log2.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  }
});

// ../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "../../mnt/c/Users/butters/wrk/cycle/node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/engine/frontmatter.ts
import { readFile as readFile2, writeFile as writeFile2, rename } from "node:fs/promises";
function parseFrontmatter(body) {
  const m = body.match(FM_RE);
  if (!m) throw new Error("no frontmatter");
  const fm = import_yaml.default.parse(m[1]) ?? {};
  const bodyAfter = body.slice(m[0].length);
  return { fm, bodyAfter };
}
function serializeFrontmatter(fm, bodyAfter) {
  return "---\n" + import_yaml.default.stringify(fm) + "---\n" + bodyAfter;
}
async function mutateFrontmatter(path, patch) {
  const body = await readFile2(path, "utf8");
  const { fm, bodyAfter } = parseFrontmatter(body);
  const next = patch({ ...fm });
  const out = serializeFrontmatter(next, bodyAfter);
  const tmp = path + ".tmp";
  await writeFile2(tmp, out, "utf8");
  await rename(tmp, path);
}
var import_yaml, FM_RE;
var init_frontmatter = __esm({
  "src/engine/frontmatter.ts"() {
    "use strict";
    import_yaml = __toESM(require_dist(), 1);
    FM_RE = /^---\n([\s\S]*?)\n---\n/;
  }
});

// src/engine/queue.ts
import { readFile as readFile3, writeFile as writeFile3, rename as rename2, appendFile, mkdir as mkdir2, stat } from "node:fs/promises";
import { join as join2 } from "node:path";
function normalizePriority(raw) {
  if (raw === "discuss") return "idea";
  if (raw === "low" || raw === "medium" || raw === "high" || raw === "critical" || raw === "idea") return raw;
  if (typeof raw === "number") {
    if (raw >= 7) return "critical";
    if (raw >= 5) return "high";
    if (raw >= 3) return "medium";
    return "low";
  }
  return "medium";
}
function queuePath(repoRoot) {
  return join2(repoRoot, ".cycle", "tbd.jsonl");
}
async function ensureCycleDir(repoRoot) {
  await mkdir2(join2(repoRoot, ".cycle"), { recursive: true });
}
function isLegacyLine(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  const obj = parsed;
  if (typeof obj.id !== "string") return false;
  return obj.status === void 0;
}
function isQueueRow(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  const obj = parsed;
  if (typeof obj.id !== "string") return false;
  if (typeof obj.title !== "string") return false;
  if (obj.status !== "pending" && obj.status !== "in_progress") return false;
  if (typeof obj.attempt !== "number") return false;
  if (!Array.isArray(obj.depends_on)) return false;
  if (typeof obj.triaged_at !== "string") return false;
  if (obj.priority !== "low" && obj.priority !== "medium" && obj.priority !== "high" && obj.priority !== "critical" && obj.priority !== "idea") return false;
  return true;
}
async function readQueue(repoRoot, ops = defaultQueueFsOps) {
  const path = queuePath(repoRoot);
  let raw;
  try {
    raw = await ops.readFile(path, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const rows = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === "object") {
      const o = parsed;
      o.priority = normalizePriority(o.priority ?? o.priority_hint);
      delete o.priority_hint;
    }
    if (!isQueueRow(parsed)) continue;
    rows.push(parsed);
  }
  return rows;
}
async function writeQueue(repoRoot, rows, ops = defaultQueueFsOps) {
  await ensureCycleDir(repoRoot);
  const path = queuePath(repoRoot);
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  const tmp = path + ".tmp";
  await ops.writeFile(tmp, body, "utf8");
  await ops.rename(tmp, path);
}
async function appendRow(repoRoot, row, ops = defaultQueueFsOps) {
  await ensureCycleDir(repoRoot);
  await ops.appendFile(queuePath(repoRoot), JSON.stringify(row) + "\n", "utf8");
}
async function pickArchivePath(repoRoot) {
  const base = join2(repoRoot, ".cycle", "tbd.jsonl.bootstrap-archive");
  try {
    await stat(base);
  } catch {
    return base;
  }
  for (let i = 1; i < 1e3; i++) {
    const candidate = `${base}.${i}`;
    try {
      await stat(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("too many bootstrap archives");
}
async function bootstrapArchiveIfLegacy(repoRoot, ops = defaultQueueFsOps) {
  const path = queuePath(repoRoot);
  let raw;
  try {
    raw = await ops.readFile(path, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
  let hasLegacy = false;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (isLegacyLine(parsed)) {
      hasLegacy = true;
      break;
    }
  }
  if (!hasLegacy) return false;
  const archive = await pickArchivePath(repoRoot);
  try {
    await ops.rename(path, archive);
  } catch (e) {
    throw Object.assign(
      new Error(`bootstrapArchiveIfLegacy: rename failed: ${e.message}`),
      { code: e.code }
    );
  }
  return true;
}
async function popNextPending(repoRoot) {
  const rows = await readQueue(repoRoot);
  const allIds = new Set(rows.map((r) => r.id));
  const pending = rows.filter((r) => r.status === "pending" && r.priority !== "idea").sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  for (const row of pending) {
    const blocked = row.depends_on.some((dep) => allIds.has(dep) && dep !== row.id);
    if (!blocked) return row;
  }
  return null;
}
async function markInProgress(repoRoot, id, cycleId) {
  const rows = await readQueue(repoRoot);
  let touched = false;
  for (const r of rows) {
    if (r.id !== id) continue;
    if (r.status === "in_progress" && r.cycle_id && r.cycle_id !== cycleId) {
      throw new Error(
        `markInProgress: row ${id} already in_progress for cycle ${r.cycle_id}, refusing to overwrite with ${cycleId}`
      );
    }
    r.status = "in_progress";
    r.cycle_id = cycleId;
    touched = true;
  }
  if (!touched) throw new Error(`markInProgress: id not found: ${id}`);
  await writeQueue(repoRoot, rows);
}
async function drainOk(repoRoot, id) {
  const rows = await readQueue(repoRoot);
  const next = rows.filter((r) => r.id !== id);
  await writeQueue(repoRoot, next);
}
async function drainFailedRetry(repoRoot, id) {
  const rows = await readQueue(repoRoot);
  for (const r of rows) {
    if (r.id === id) {
      r.attempt += 1;
      r.status = "pending";
    }
  }
  await writeQueue(repoRoot, rows);
}
async function drainFailedTerminal(repoRoot, id) {
  const rows = await readQueue(repoRoot);
  const next = rows.filter((r) => r.id !== id);
  await writeQueue(repoRoot, next);
}
var defaultQueueFsOps, PRIORITY_ORDER;
var init_queue = __esm({
  "src/engine/queue.ts"() {
    "use strict";
    defaultQueueFsOps = { readFile: readFile3, writeFile: writeFile3, rename: rename2, appendFile };
    PRIORITY_ORDER = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      idea: 4
    };
  }
});

// src/engine/exec-spawn.ts
import { spawn } from "node:child_process";
import { readFile as readFile4 } from "node:fs/promises";
import { join as join3 } from "node:path";
async function runAgent(opts) {
  const { binary, argv: argv2, promptDelivery, promptPath, repoRoot, env, signal, timeoutMs } = opts;
  const abs = join3(repoRoot, ".cycle", promptPath);
  const base = { cwd: repoRoot, env: buildChildEnv(env ?? {}), shell: false, signal, detached: true };
  let finalArgv;
  let prompt;
  if (promptDelivery === "file") {
    finalArgv = [...argv2, abs];
  } else {
    prompt = await readFile4(abs, "utf8");
    finalArgv = promptDelivery === "argv" ? [...argv2, prompt] : argv2;
  }
  return new Promise((resolve2) => {
    const child = promptDelivery === "stdin" ? spawn(binary, finalArgv, base) : spawn(binary, finalArgv, { ...base, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer;
    let killTimer;
    const done = (r) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve2(r);
    };
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      done(timedOut ? { status: "failed", exitCode: code ?? -1, stdout, stderr, timedOut: true } : { status: code === 0 ? "ok" : "failed", exitCode: code ?? -1, stdout, stderr });
    });
    child.on("error", (err) => {
      done({ status: "failed", exitCode: -1, stdout: "", stderr: err.message });
    });
    const killTree = (sig) => {
      try {
        if (child.pid) process.kill(-child.pid, sig);
      } catch {
        try {
          child.kill(sig);
        } catch {
        }
      }
    };
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree("SIGTERM");
        killTimer = setTimeout(() => killTree("SIGKILL"), 5e3);
        if (killTimer.unref) killTimer.unref();
      }, timeoutMs);
      if (timer.unref) timer.unref();
    }
    if (promptDelivery === "stdin") {
      child.stdin.on("error", () => {
      });
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}
var init_exec_spawn = __esm({
  "src/engine/exec-spawn.ts"() {
    "use strict";
    init_child_env();
  }
});

// src/engine/rate-limit.ts
function isRateLimitError(result) {
  if (result.exitCode === 429) return true;
  if (result.exitCode !== 1) return false;
  const combined = (result.stderr + result.stdout).toLowerCase();
  return RATE_LIMIT_PATTERNS.some((p) => combined.includes(p));
}
var RATE_LIMIT_PATTERNS;
var init_rate_limit = __esm({
  "src/engine/rate-limit.ts"() {
    "use strict";
    RATE_LIMIT_PATTERNS = ["rate limit", "429", "too many requests"];
  }
});

// src/engine/exec-auggie.ts
var auggieExec;
var init_exec_auggie = __esm({
  "src/engine/exec-auggie.ts"() {
    "use strict";
    init_exec_spawn();
    init_rate_limit();
    auggieExec = {
      async runStep({ model, thinking, ...args2 }) {
        const binary = process.env.CYCLE_AUGGIE_BIN ?? "auggie";
        const argv2 = ["--print", "--instruction-file"];
        if (model) argv2.push("--model", model);
        const r = await runAgent({ binary, argv: argv2, promptDelivery: "file", ...args2 });
        if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true };
        return r;
      }
    };
  }
});

// src/engine/exec-claudecode.ts
var claudecodeExec;
var init_exec_claudecode = __esm({
  "src/engine/exec-claudecode.ts"() {
    "use strict";
    init_exec_spawn();
    init_rate_limit();
    claudecodeExec = {
      async runStep({ appendSystemPrompt, model, thinking, settingsPath, ...args2 }) {
        const argv2 = ["--permission-mode", "auto"];
        if (appendSystemPrompt) argv2.push("--append-system-prompt", appendSystemPrompt);
        if (model) argv2.push("--model", model);
        if (settingsPath) argv2.push("--settings", settingsPath);
        argv2.push("-p");
        const binary = process.env.CYCLE_CLAUDE_BIN ?? "claude";
        const r = await runAgent({ binary, argv: argv2, promptDelivery: "argv", ...args2 });
        if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true };
        return r;
      }
    };
  }
});

// src/engine/exec-codex.ts
var codexExec;
var init_exec_codex = __esm({
  "src/engine/exec-codex.ts"() {
    "use strict";
    init_exec_spawn();
    init_rate_limit();
    codexExec = {
      async runStep({ model, thinking, ...args2 }) {
        const argv2 = ["exec"];
        if (model) argv2.push("--model", model);
        if (thinking) argv2.push("-c", `model_reasoning_effort="${thinking}"`);
        const binary = process.env.CYCLE_CODEX_BIN ?? "codex";
        const r = await runAgent({ binary, argv: argv2, promptDelivery: "stdin", ...args2 });
        if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true };
        return r;
      }
    };
  }
});

// src/engine/exec-gemini.ts
var geminiExec;
var init_exec_gemini = __esm({
  "src/engine/exec-gemini.ts"() {
    "use strict";
    init_exec_spawn();
    init_rate_limit();
    geminiExec = {
      async runStep({ model, thinking, ...args2 }) {
        const argv2 = [];
        if (model) argv2.push("--model", model);
        const binary = process.env.CYCLE_GEMINI_BIN ?? "gemini";
        const r = await runAgent({ binary, argv: argv2, promptDelivery: "stdin", ...args2 });
        if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true };
        return r;
      }
    };
  }
});

// src/engine/exec-opencode.ts
var opencodeExec;
var init_exec_opencode = __esm({
  "src/engine/exec-opencode.ts"() {
    "use strict";
    init_exec_spawn();
    init_rate_limit();
    opencodeExec = {
      async runStep({ model, thinking, ...args2 }) {
        const argv2 = ["run"];
        if (model) argv2.push("--model", model);
        if (thinking) argv2.push("--thinking", thinking);
        const binary = process.env.CYCLE_OPENCODE_BIN ?? "opencode";
        const r = await runAgent({ binary, argv: argv2, promptDelivery: "argv", ...args2 });
        if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true };
        return r;
      }
    };
  }
});

// src/engine/exec-pi.ts
var piExec;
var init_exec_pi = __esm({
  "src/engine/exec-pi.ts"() {
    "use strict";
    init_exec_spawn();
    init_rate_limit();
    piExec = {
      async runStep({ model, thinking, ...args2 }) {
        const binary = process.env.CYCLE_PI_BIN ?? "pi";
        const argv2 = ["--print"];
        if (model) argv2.push("--model", model);
        if (thinking) argv2.push("--thinking", thinking);
        const r = await runAgent({ binary, argv: argv2, promptDelivery: "stdin", ...args2 });
        if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true };
        return r;
      }
    };
  }
});

// src/engine/exec.ts
function knownAgents() {
  return Object.keys(REGISTRY);
}
function resolveAgent(name) {
  const mod = REGISTRY[name];
  if (!mod) throw new UnknownAgentError(name, Object.keys(REGISTRY));
  return mod;
}
var UnknownAgentError, REGISTRY;
var init_exec = __esm({
  "src/engine/exec.ts"() {
    "use strict";
    init_exec_auggie();
    init_exec_claudecode();
    init_exec_codex();
    init_exec_gemini();
    init_exec_opencode();
    init_exec_pi();
    UnknownAgentError = class extends Error {
      constructor(name, known) {
        const list = [...known].sort().join(", ");
        super(`agent "${name}" is not registered; known agents: ${list}`);
        this.name = "UnknownAgentError";
      }
    };
    REGISTRY = {
      auggie: auggieExec,
      claudecode: claudecodeExec,
      codex: codexExec,
      gemini: geminiExec,
      opencode: opencodeExec,
      pi: piExec
    };
  }
});

// src/engine/log-fmt.ts
function truncateHeadCapped(s, max) {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}
function stripFences(s) {
  const m = s.trim().match(/```(?:\w+)?\r?\n([\s\S]*?)\r?\n```/);
  return m ? m[1] : s;
}
var init_log_fmt = __esm({
  "src/engine/log-fmt.ts"() {
    "use strict";
  }
});

// src/engine/triage.ts
import { randomBytes } from "node:crypto";
import { readFile as readFile5, writeFile as writeFile4, readdir, mkdir as mkdir3, rename as rename3, unlink } from "node:fs/promises";
import { join as join4, dirname as dirname3 } from "node:path";
async function processRawWithRetry(raw, ctx) {
  let lastError = "";
  let attemptsRun = 0;
  for (let attempt = raw.attempts; attempt < MAX_ATTEMPTS; attempt++) {
    attemptsRun++;
    const queueRows = await readQueue(ctx.repoRoot, ctx.fs);
    const todoListing = await listTodos(ctx.repoRoot);
    const feedback = lastError ? `PREVIOUS ATTEMPT FAILED VALIDATION:
${lastError}` : "";
    const renderedPrompt = renderPrompt(
      ctx.promptTemplate,
      [raw],
      queueRows,
      todoListing,
      feedback
    );
    let agentResult;
    try {
      agentResult = await ctx.runAgent(renderedPrompt, ctx.cfg.triage, ctx.repoRoot);
    } catch (e) {
      lastError = `agent failed: ${e.message}`;
      if (ctx.onAttemptFailed) await ctx.onAttemptFailed(attempt + 1, lastError);
      continue;
    }
    if (agentResult.exitCode !== 0) {
      lastError = `agent exited ${agentResult.exitCode}: ${agentResult.stderr.trim()}`;
      if (ctx.onAttemptFailed) await ctx.onAttemptFailed(attempt + 1, lastError);
      continue;
    }
    const todoIds = new Set(todoListing.map((f) => f.replace(/\.md$/, "")));
    const validation = validateOutput(
      agentResult.stdout,
      [raw],
      queueRows,
      ctx.cfg,
      todoIds
    );
    if (!validation.ok) {
      lastError = validation.reason;
      if (ctx.onAttemptFailed) await ctx.onAttemptFailed(attempt + 1, lastError);
      continue;
    }
    if (ctx.apply) {
      try {
        await ctx.apply(raw, validation.parsed);
      } catch (e) {
        lastError = `apply failed: ${e.message}`;
        if (ctx.onAttemptFailed) await ctx.onAttemptFailed(attempt + 1, lastError);
        continue;
      }
    }
    return { status: "ok", parsed: validation.parsed, attempts: attemptsRun };
  }
  return { status: "failed", lastError, attempts: attemptsRun };
}
async function runTriage(repoRoot, cfg2, log2, deps = {}) {
  const runAgent2 = deps.runAgent ?? runAgentViaDispatch;
  const fs = deps.fs ?? defaultQueueFsOps;
  await bootstrapArchiveIfLegacy(repoRoot, fs);
  const rawDir2 = join4(repoRoot, "docs/cycle/issues/inbox");
  await mkdir3(rawDir2, { recursive: true });
  const raws = await loadRaws(rawDir2, log2, fs);
  await log2.emit("triage.start", { count: raws.length });
  if (raws.length === 0) {
    await log2.emit("triage.end", { processed: 0, failed: 0 });
    return { status: "ok", processed: [], failed: [] };
  }
  const promptTemplate = await readFile5(
    join4(repoRoot, ".cycle", cfg2.triage.prompt),
    "utf8"
  );
  const processed = [];
  const failed = [];
  const lastErrors = [];
  const failedRaws = [];
  let lastOrdering = null;
  for (const raw of raws) {
    if (raw.fm.priority === "idea") {
      await parkForIdeas(repoRoot, raw, log2);
      continue;
    }
    const outcome = await processRawWithRetry(raw, {
      repoRoot,
      cfg: cfg2,
      promptTemplate,
      runAgent: runAgent2,
      fs,
      apply: (r, parsed) => applyRaw(repoRoot, r, parsed, fs),
      onAttemptFailed: async (attemptNumber, reason) => {
        await bumpAttempts(raw.srcPath, attemptNumber);
        await log2.emit("triage.raw.failed", {
          raw_id: raw.id,
          attempt: attemptNumber,
          reason
        });
      }
    });
    if (outcome.status === "ok") {
      lastOrdering = outcome.parsed.ordering;
      await log2.emit("triage.raw.ok", {
        raw_id: raw.id,
        children: outcome.parsed.children.filter((c) => c.raw_id === raw.id).map((c) => c.id)
      });
      processed.push(raw.id);
    } else {
      failed.push(raw.id);
      lastErrors.push(outcome.lastError);
      failedRaws.push(raw);
    }
  }
  if (lastOrdering) {
    await rewriteOrdering(repoRoot, lastOrdering, log2, fs);
  }
  const actionableCount = raws.filter((r) => r.fm.priority !== "idea").length;
  if (actionableCount > 0 && failed.length === actionableCount) {
    for (const raw of failedRaws) {
      try {
        await mutateFrontmatter(raw.srcPath, (fm) => ({ ...fm, triage_attempts: 0 }));
      } catch {
      }
    }
    const raw_ids = failed;
    const last_errors = failed.map((raw_id, i) => ({
      raw_id,
      error: truncateHeadCapped(lastErrors[i] ?? "", 2e3)
    }));
    await log2.emit("engine.paused", {
      reason: "all_triage_failed",
      raw_ids,
      last_errors
    });
    return { status: "paused", processed, failed };
  }
  for (const raw of failedRaws) {
    await moveToFailed(repoRoot, raw);
  }
  await log2.emit("triage.end", {
    processed: processed.length,
    failed: failed.length
  });
  return { status: "ok", processed, failed };
}
async function dryRunTriage(repoRoot, cfg2, deps = {}) {
  const runAgent2 = deps.runAgent ?? runAgentViaDispatch;
  const fs = deps.fs ?? defaultQueueFsOps;
  const rawDir2 = join4(repoRoot, "docs/cycle/issues/inbox");
  const silentLog = { async emit() {
  } };
  const raws = await loadRaws(rawDir2, silentLog, fs);
  if (raws.length === 0) return [];
  const promptPath = join4(repoRoot, ".cycle", cfg2.triage.prompt);
  let promptTemplate;
  try {
    promptTemplate = await readFile5(promptPath, "utf8");
  } catch (e) {
    throw new Error(
      `prompt template missing: ${promptPath}: ${e.message}`
    );
  }
  const reports = [];
  for (const raw of raws) {
    if (raw.fm.priority === "idea") continue;
    const outcome = await processRawWithRetry(
      { ...raw, attempts: 0 },
      {
        repoRoot,
        cfg: cfg2,
        promptTemplate,
        runAgent: runAgent2,
        fs
      }
    );
    if (outcome.status === "ok") {
      reports.push({
        raw_id: raw.id,
        status: "ok",
        attempts: outcome.attempts,
        children: outcome.parsed.children.filter((c) => c.raw_id === raw.id).map((c) => c.id)
      });
    } else {
      reports.push({
        raw_id: raw.id,
        status: "failed",
        attempts: outcome.attempts,
        last_error: outcome.lastError
      });
    }
  }
  return reports;
}
async function loadRaws(rawDir2, log2, fs = defaultQueueFsOps) {
  let files = [];
  try {
    files = (await readdir(rawDir2)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
  const raws = [];
  for (const f of files) {
    const srcPath = join4(rawDir2, f);
    try {
      const body = await fs.readFile(srcPath, "utf8");
      const { fm, bodyAfter } = parseFrontmatter(body);
      const id = String(fm.id);
      const attempts = typeof fm.triage_attempts === "number" ? fm.triage_attempts : 0;
      raws.push({ id, body: bodyAfter, fm, srcPath, attempts });
    } catch (e) {
      const raw_id = f.replace(/.md$/, "");
      await log2.emit("triage.raw.load_error", {
        raw_id,
        error: truncateHeadCapped(String(e.message ?? e), 2e3)
      });
    }
  }
  return raws;
}
async function listTodos(repoRoot) {
  const todoDir2 = join4(repoRoot, "docs/cycle/issues/todo");
  try {
    return (await readdir(todoDir2)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
}
function renderPrompt(template, raws, queueRows, todoListing, retryFeedback) {
  const rawsBlock = raws.map((r) => {
    const fmSerialized = serializeFrontmatter(r.fm, r.body);
    return `=== raw: ${r.id} ===
${fmSerialized}`;
  }).join("\n");
  const tbd = queueRows.map((r) => JSON.stringify(r)).join("\n");
  const todoText = todoListing.join("\n");
  return template.replace("{{RAWS_BLOCK}}", rawsBlock).replace("{{TBD_JSONL}}", tbd).replace("{{TODO_LISTING}}", todoText).replace("{{RETRY_FEEDBACK}}", retryFeedback);
}
function validateOutput(rawStdout, raws, queueRows, cfg2, todoIds = /* @__PURE__ */ new Set()) {
  let parsed;
  try {
    parsed = JSON.parse(stripFences(rawStdout));
  } catch (e) {
    return { ok: false, reason: `stdout is not valid JSON: ${e.message}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "stdout is not a JSON object" };
  }
  const obj = parsed;
  if (!Array.isArray(obj.ordering)) {
    return {
      ok: false,
      reason: `ordering: expected array, got ${typeof obj.ordering}`
    };
  }
  for (let i = 0; i < obj.ordering.length; i++) {
    if (typeof obj.ordering[i] !== "string") {
      return { ok: false, reason: `ordering[${i}]: expected string` };
    }
  }
  if (!Array.isArray(obj.children)) {
    return {
      ok: false,
      reason: `children: expected array, got ${typeof obj.children}`
    };
  }
  if (!Array.isArray(obj.decomposed_parents)) {
    return {
      ok: false,
      reason: `decomposed_parents: expected array, got ${typeof obj.decomposed_parents}`
    };
  }
  for (let i = 0; i < obj.decomposed_parents.length; i++) {
    if (typeof obj.decomposed_parents[i] !== "string") {
      return {
        ok: false,
        reason: `decomposed_parents[${i}]: expected string`
      };
    }
  }
  const children = [];
  const childIds = /* @__PURE__ */ new Set();
  const stringFields = [
    "raw_id",
    "slug",
    "id",
    "title",
    "workflow",
    "body"
  ];
  for (let i = 0; i < obj.children.length; i++) {
    const c = obj.children[i];
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      return { ok: false, reason: `children[${i}]: expected object` };
    }
    const co = c;
    for (const field of stringFields) {
      if (typeof co[field] !== "string") {
        return {
          ok: false,
          reason: `children[${i}].${field}: expected string, got ${typeof co[field]}`
        };
      }
    }
    if (!Array.isArray(co.depends_on)) {
      return {
        ok: false,
        reason: `children[${i}].depends_on: expected array, got ${typeof co.depends_on}`
      };
    }
    for (let j = 0; j < co.depends_on.length; j++) {
      if (typeof co.depends_on[j] !== "string") {
        return {
          ok: false,
          reason: `children[${i}].depends_on[${j}]: expected string`
        };
      }
    }
    const child = co;
    if (child.id !== child.raw_id && child.id !== `${child.raw_id}-${child.slug}`) {
      return {
        ok: false,
        reason: `children[${i}].id: expected ${child.raw_id} or ${child.raw_id}-${child.slug}, got ${child.id}`
      };
    }
    if (!cfg2.workflows.some((w) => w.name === child.workflow)) {
      return {
        ok: false,
        reason: `children[${i}].workflow: ${child.workflow} not in configured workflows`
      };
    }
    if (!raws.some((r) => r.id === child.raw_id)) {
      return {
        ok: false,
        reason: `children[${i}].raw_id: ${child.raw_id} not in current batch`
      };
    }
    if (childIds.has(child.id)) {
      return {
        ok: false,
        reason: `children[${i}].id: duplicate ${child.id}`
      };
    }
    childIds.add(child.id);
    children.push(child);
  }
  for (const p of obj.decomposed_parents) {
    if (!raws.some((r) => r.id === p)) {
      return {
        ok: false,
        reason: `decomposed_parents: ${p} not in current batch`
      };
    }
  }
  const queueIds = new Set(queueRows.map((r) => r.id));
  for (let i = 0; i < children.length; i++) {
    if (queueIds.has(children[i].id)) {
      return {
        ok: false,
        reason: `children[${i}].id: ${children[i].id} collides with existing queue row`
      };
    }
  }
  const pendingIds = new Set(
    queueRows.filter((r) => r.status === "pending").map((r) => r.id)
  );
  const orderingArr = obj.ordering;
  const orderingSeen = /* @__PURE__ */ new Set();
  for (let i = 0; i < orderingArr.length; i++) {
    const id = orderingArr[i];
    if (orderingSeen.has(id)) {
      return { ok: false, reason: `ordering[${i}]: duplicate ${id}` };
    }
    orderingSeen.add(id);
    if (!pendingIds.has(id) && !childIds.has(id)) {
      return {
        ok: false,
        reason: `ordering[${i}]: ${id} not in current pending and not in new children`
      };
    }
  }
  const knownIds = /* @__PURE__ */ new Set([...childIds, ...queueIds, ...todoIds]);
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    for (let j = 0; j < c.depends_on.length; j++) {
      const dep = c.depends_on[j];
      if (dep === c.id) {
        return {
          ok: false,
          reason: `children[${i}].depends_on[${j}]: ${c.id} depends on itself (self-loop)`
        };
      }
      if (!knownIds.has(dep)) {
        return {
          ok: false,
          reason: `children[${i}].depends_on[${j}]: ${dep} is not a sibling child, tbd.jsonl row, or todo/<id>.md file (offending child: ${c.id})`
        };
      }
    }
  }
  return {
    ok: true,
    parsed: {
      ordering: orderingArr,
      children,
      decomposed_parents: obj.decomposed_parents
    }
  };
}
async function applyRaw(repoRoot, raw, parsed, fs = defaultQueueFsOps) {
  const children = parsed.children.filter((c) => c.raw_id === raw.id);
  const appliedTodos = [];
  const appliedIds = [];
  const todoDir2 = join4(repoRoot, "docs/cycle/issues/todo");
  const doneDir2 = join4(repoRoot, "docs/cycle/issues/done");
  await mkdir3(todoDir2, { recursive: true });
  try {
    const triagedAt = (/* @__PURE__ */ new Date()).toISOString();
    const priority = normalizePriority(raw.fm.priority);
    for (const child of children) {
      const todoPath = join4(todoDir2, `${child.id}.md`);
      const fm = {
        id: child.id,
        title: child.title,
        workflow: child.workflow,
        depends_on: child.depends_on,
        triaged_at: triagedAt,
        source: "triage",
        priority
      };
      if (child.id !== raw.id) fm.parent = raw.id;
      const bodyTail = child.body.endsWith("\n") ? child.body : child.body + "\n";
      const todoContent = serializeFrontmatter(fm, bodyTail);
      await atomicWrite(todoPath, todoContent, fs);
      appliedTodos.push(todoPath);
      const row = {
        id: child.id,
        title: child.title,
        status: "pending",
        attempt: 0,
        depends_on: child.depends_on,
        triaged_at: triagedAt,
        priority
      };
      if (child.id !== raw.id) row.parent = raw.id;
      await appendRow(repoRoot, row, fs);
      appliedIds.push(child.id);
    }
    await mkdir3(doneDir2, { recursive: true });
    await fs.rename(raw.srcPath, join4(doneDir2, `${raw.id}_raw.md`));
  } catch (e) {
    for (const todo of appliedTodos) {
      try {
        await unlink(todo);
      } catch {
      }
    }
    if (appliedIds.length > 0) {
      try {
        const rows = await readQueue(repoRoot, fs);
        const idSet = new Set(appliedIds);
        const next = rows.filter((r) => !idSet.has(r.id));
        await writeQueue(repoRoot, next, fs);
      } catch {
      }
    }
    throw e;
  }
}
async function atomicWrite(path, content, fs = defaultQueueFsOps) {
  await mkdir3(dirname3(path), { recursive: true });
  const tmp = path + ".tmp";
  await fs.writeFile(tmp, content, "utf8");
  try {
    await fs.rename(tmp, path);
  } catch (e) {
    try {
      await unlink(tmp);
    } catch {
    }
    throw e;
  }
}
async function bumpAttempts(srcPath, attempts) {
  try {
    await mutateFrontmatter(srcPath, (fm) => ({
      ...fm,
      triage_attempts: attempts
    }));
  } catch {
  }
}
async function moveToFailed(repoRoot, raw) {
  const failedDir2 = join4(repoRoot, "docs/cycle/issues/failed");
  await mkdir3(failedDir2, { recursive: true });
  try {
    await mutateFrontmatter(raw.srcPath, (fm) => ({
      ...fm,
      triage_attempts: MAX_ATTEMPTS,
      failed_at: (/* @__PURE__ */ new Date()).toISOString(),
      failed_step: "triage"
    }));
  } catch {
  }
  try {
    await rename3(raw.srcPath, join4(failedDir2, `${raw.id}.md`));
  } catch {
  }
}
async function parkForIdeas(repoRoot, raw, log2) {
  const discussDir = join4(repoRoot, "docs/cycle/issues/ideas");
  await mkdir3(discussDir, { recursive: true });
  const destPath = join4(discussDir, `${raw.id}.md`);
  let renamed = true;
  try {
    await rename3(raw.srcPath, destPath);
  } catch (e) {
    await log2.emit("issue.park_failed", { id: raw.id, error: String(e) });
    renamed = false;
  }
  if (renamed) {
    await log2.emit("issue.parked_for_ideas", {
      id: raw.id,
      priority: "idea",
      path: destPath
    });
  }
}
async function rewriteOrdering(repoRoot, ordering, log2, fs = defaultQueueFsOps) {
  const rows = await readQueue(repoRoot, fs);
  const inProgress = rows.filter((r) => r.status === "in_progress");
  const pending = rows.filter((r) => r.status === "pending");
  const byId = new Map(pending.map((r) => [r.id, r]));
  const ordered = [];
  for (const id of ordering) {
    const row = byId.get(id);
    if (row) {
      ordered.push(row);
      byId.delete(id);
    }
  }
  for (const [id, row] of byId) {
    await log2.emit("triage.warning", { reason: "ordering_omitted", id });
    ordered.push(row);
  }
  await writeQueue(repoRoot, [...inProgress, ...ordered], fs);
}
async function runAgentViaDispatch(prompt, cfg2, repoRoot) {
  const mod = resolveAgent(cfg2.agent);
  const cycleDir = join4(repoRoot, ".cycle");
  await mkdir3(cycleDir, { recursive: true });
  const tmpName = `.triage-${randomBytes(8).toString("hex")}.prompt.md`;
  const tmpPath = join4(cycleDir, tmpName);
  try {
    await writeFile4(tmpPath, prompt, "utf8");
    const r = await mod.runStep({ repoRoot, promptPath: tmpName });
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
  } finally {
    await unlink(tmpPath).catch(() => {
    });
  }
}
var MAX_ATTEMPTS;
var init_triage = __esm({
  "src/engine/triage.ts"() {
    "use strict";
    init_frontmatter();
    init_queue();
    init_exec();
    init_log_fmt();
    MAX_ATTEMPTS = 3;
  }
});

// src/engine/log.ts
import { appendFile as appendFile2, mkdir as mkdir4 } from "node:fs/promises";
import { join as join5 } from "node:path";
async function createLogger(repoRoot, sink = console.log) {
  const path = join5(repoRoot, ".cycle", "log.jsonl");
  await mkdir4(join5(repoRoot, ".cycle"), { recursive: true });
  return {
    async emit(event, fields) {
      const line = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event, ...fields });
      await appendFile2(path, line + "\n", "utf8");
      sink(line);
    }
  };
}
var init_log = __esm({
  "src/engine/log.ts"() {
    "use strict";
  }
});

// src/engine/cycle-id.ts
import { readFile as readFile6, readdir as readdir2 } from "node:fs/promises";
import { join as join6 } from "node:path";
async function allocateCycleId(repoRoot) {
  let highest = 0;
  try {
    const log2 = await readFile6(join6(repoRoot, ".cycle/log.jsonl"), "utf8");
    for (const line of log2.split("\n")) {
      if (!line) continue;
      try {
        const e = JSON.parse(line);
        const id = typeof e.cycle_id === "string" ? parseInt(e.cycle_id, 10) : NaN;
        if (!Number.isNaN(id) && id > highest) highest = id;
      } catch {
      }
    }
  } catch {
  }
  try {
    const entries = await readdir2(join6(repoRoot, "docs/cycle"), { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const m = /^(\d{4})-/.exec(ent.name);
      if (!m) continue;
      const id = parseInt(m[1], 10);
      if (!Number.isNaN(id) && id > highest) highest = id;
    }
  } catch {
  }
  return String(highest + 1).padStart(4, "0");
}
var init_cycle_id = __esm({
  "src/engine/cycle-id.ts"() {
    "use strict";
  }
});

// src/engine/workflow.ts
import { readFile as readFile7 } from "node:fs/promises";
import { join as join7 } from "node:path";
async function loadConfig(repoRoot, env = process.env) {
  const path = join7(repoRoot, ".cycle/workflows.yml");
  let body;
  try {
    body = await readFile7(path, "utf8");
  } catch {
    throw new Error(`workflows.yml missing: ${path}`);
  }
  const parsed = import_yaml2.default.parse(body);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`workflows.yml malformed: not an object (${path})`);
  }
  if (!parsed.engine || typeof parsed.engine !== "object") {
    throw new Error(`workflows.yml malformed: missing engine (${path})`);
  }
  if (!parsed.triage || typeof parsed.triage !== "object") {
    throw new Error(`workflows.yml malformed: missing triage (${path})`);
  }
  if (!Array.isArray(parsed.workflows)) {
    throw new Error(`workflows.yml malformed: workflows must be an array (${path})`);
  }
  for (const w of parsed.workflows) {
    if (!w?.name || !Array.isArray(w.steps)) {
      throw new Error(`workflows.yml malformed: workflow entry missing name or steps (${path})`);
    }
  }
  const COMMIT_DEFAULTS = { mode: "trunk", push: true };
  const rawCommit = parsed.engine.commit;
  let commitConfig;
  if (!rawCommit) {
    commitConfig = COMMIT_DEFAULTS;
  } else {
    const mode = rawCommit.mode;
    if (mode !== "trunk" && mode !== "local-only" && mode !== "worktree-pr") {
      throw new Error(
        `workflows.yml malformed: engine.commit.mode must be "trunk", "local-only", or "worktree-pr", got "${mode}" (${path})`
      );
    }
    commitConfig = { mode, push: rawCommit.push !== false };
  }
  if (env.CYCLE_TRUNK_BASED === "1") {
    commitConfig.mode = "trunk";
  }
  parsed.engine.commit = commitConfig;
  if (typeof parsed.engine.shell !== "string" || parsed.engine.shell.trim() === "") {
    delete parsed.engine.shell;
  }
  const rawDefaults = parsed.defaults;
  if (rawDefaults !== void 0 && (rawDefaults === null || typeof rawDefaults !== "object" || Array.isArray(rawDefaults))) {
    throw new Error(`workflows.yml malformed: defaults must be an object (${path})`);
  }
  const defaults = rawDefaults ?? {};
  const validAgents = /* @__PURE__ */ new Set([...knownAgents(), "bash"]);
  for (const w of parsed.workflows) {
    for (const step of w.steps) {
      const agent = step.agent ?? defaults.agent;
      if (!agent) {
        throw new Error(
          `workflows.yml malformed: workflow "${w.name}" step "${step.name}" has no agent and no defaults.agent (${path})`
        );
      }
      if (!validAgents.has(agent)) {
        throw new Error(
          `workflows.yml malformed: workflow "${w.name}" step "${step.name}" has unknown agent "${agent}" (${path})`
        );
      }
      step.agent = agent;
      if (step.model === void 0 && defaults.model !== void 0) step.model = defaults.model;
      if (step.thinking === void 0 && defaults.thinking !== void 0) step.thinking = defaults.thinking;
    }
  }
  return parsed;
}
var import_yaml2;
var init_workflow = __esm({
  "src/engine/workflow.ts"() {
    "use strict";
    import_yaml2 = __toESM(require_dist(), 1);
    init_exec();
  }
});

// src/engine/log-tail.ts
import { readFile as readFile8 } from "node:fs/promises";
import { join as join9 } from "node:path";
function parseLogTail(text) {
  const events = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
    }
  }
  let lastStartIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event === "cycle.start") {
      lastStartIdx = i;
      break;
    }
  }
  if (lastStartIdx < 0) return null;
  const start = events[lastStartIdx];
  const cycleId = typeof start.cycle_id === "string" ? start.cycle_id : "";
  if (!cycleId) return null;
  for (let i = lastStartIdx + 1; i < events.length; i++) {
    if (events[i].event === "cycle.end" && events[i].cycle_id === cycleId) {
      return null;
    }
  }
  const completedSteps = [];
  for (let i = lastStartIdx + 1; i < events.length; i++) {
    const e = events[i];
    if (e.cycle_id !== cycleId) continue;
    let name;
    if (e.event === "step.end" && e.status === "ok") {
      name = e.step;
    } else if (e.event === "step.skipped") {
      name = e.step;
    } else if (e.event === "step.end" && e.status === "skipped") {
      name = e.step;
    } else {
      continue;
    }
    if (typeof name === "string" && !completedSteps.includes(name)) {
      completedSteps.push(name);
    }
  }
  let lastStepStarted;
  for (let i = events.length - 1; i > lastStartIdx; i--) {
    const e = events[i];
    if (e.event !== "step.start") continue;
    if (e.cycle_id !== cycleId) continue;
    const name = e.step;
    if (typeof name !== "string") continue;
    let ended = false;
    for (let j = i + 1; j < events.length; j++) {
      const f = events[j];
      if (f.event === "step.end" && f.cycle_id === cycleId && f.step === name) {
        ended = true;
        break;
      }
    }
    if (!ended) {
      lastStepStarted = name;
      break;
    }
  }
  const rawIssue = start.issue_id;
  const rawWf = start.workflow;
  const rawTitle = start.title;
  const issueId = typeof rawIssue === "string" ? rawIssue : "";
  const workflow = typeof rawWf === "string" ? rawWf : "";
  const title = typeof rawTitle === "string" ? rawTitle : "";
  return {
    cycleId,
    issueId,
    workflow,
    title,
    startTs: start.ts,
    completedSteps,
    lastStepStarted
  };
}
async function readLogTail(repoRoot) {
  try {
    const text = await readFile8(join9(repoRoot, ".cycle", "log.jsonl"), "utf8");
    return parseLogTail(text);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
var init_log_tail = __esm({
  "src/engine/log-tail.ts"() {
    "use strict";
  }
});

// src/engine/branch.ts
import { spawn as spawn2 } from "node:child_process";
import { mkdir as mkdir5 } from "node:fs/promises";
import { join as join10 } from "node:path";
function git(repoRoot, args2) {
  return new Promise((resolve2, reject) => {
    const child = spawn2("git", args2, { cwd: repoRoot, shell: false });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve2();
      else reject(new Error(`git ${args2.join(" ")} failed: ${stderr}`));
    });
  });
}
async function branchExists(repoRoot, branch) {
  return new Promise((resolve2) => {
    const child = spawn2("git", ["rev-parse", "--verify", `refs/heads/${branch}`], {
      cwd: repoRoot,
      shell: false
    });
    child.on("close", (code) => resolve2(code === 0));
    child.on("error", () => resolve2(false));
  });
}
async function createCycleBranch(repoRoot, opts) {
  const branch = `cycle/${opts.workflow}/${opts.slug}`;
  if (await branchExists(repoRoot, branch)) {
    await git(repoRoot, ["checkout", branch]);
  } else {
    await git(repoRoot, ["checkout", "-b", branch]);
  }
  const artifactDir = join10(repoRoot, "docs", "cycle", `${opts.cycleId}-${opts.workflow}-${opts.slug}`);
  await mkdir5(artifactDir, { recursive: true });
  return { branch, artifactDir };
}
async function checkoutCycleBranch(repoRoot, opts) {
  const branch = `cycle/${opts.workflow}/${opts.slug}`;
  await git(repoRoot, ["checkout", branch]);
  const artifactDir = join10(repoRoot, "docs", "cycle", `${opts.cycleId}-${opts.workflow}-${opts.slug}`);
  await mkdir5(artifactDir, { recursive: true });
  return { branch, artifactDir };
}
async function checkoutBase(repoRoot, base) {
  await git(repoRoot, ["checkout", base]);
}
async function prepareTrunkArtifactDir(repoRoot, opts) {
  const artifactDir = join10(repoRoot, "docs", "cycle", `${opts.cycleId}-${opts.workflow}-${opts.slug}`);
  await mkdir5(artifactDir, { recursive: true });
  return { artifactDir };
}
function revParse(repoRoot, ref) {
  return new Promise((resolve2) => {
    const child = spawn2("git", ["rev-parse", ref], { cwd: repoRoot, shell: false });
    let stdout = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.on("close", (code) => resolve2(code === 0 ? stdout.trim() : null));
    child.on("error", () => resolve2(null));
  });
}
async function pullBase(repoRoot, base) {
  const shaBefore = await revParse(repoRoot, base);
  await git(repoRoot, ["fetch", "origin", base]);
  await git(repoRoot, ["merge", "--ff-only", "FETCH_HEAD"]);
  const shaAfter = await revParse(repoRoot, base);
  return { shaBefore, shaAfter };
}
function currentBranchName(repoRoot) {
  return new Promise((resolve2) => {
    const child = spawn2("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, shell: false });
    let stdout = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.on("close", (code) => resolve2(code === 0 ? stdout.trim() : null));
    child.on("error", () => resolve2(null));
  });
}
async function revParseHead(repoRoot) {
  return revParse(repoRoot, "HEAD");
}
function gitCleanSoft(repoRoot) {
  return new Promise((resolve2) => {
    const child = spawn2("git", ["clean", "-fd"], { cwd: repoRoot, shell: false });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => resolve2(code === 0 ? null : `git clean -fd failed: ${stderr.trim()}`));
    child.on("error", (e) => resolve2(`git clean -fd failed: ${e.message}`));
  });
}
async function resetCycleBranchTo(repoRoot, sha) {
  const branch = await currentBranchName(repoRoot);
  if (!branch || !branch.startsWith("cycle/")) {
    throw new Error(`resetCycleBranchTo refuses to reset outside a cycle branch (HEAD=${branch ?? "unknown"})`);
  }
  await git(repoRoot, ["reset", "--hard", sha]);
  const cleanErr = await gitCleanSoft(repoRoot);
  return cleanErr != null ? { cleanWarning: cleanErr } : {};
}
function shaExists(repoRoot, sha) {
  return new Promise((resolve2) => {
    const child = spawn2("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: repoRoot, shell: false });
    child.on("close", (code) => resolve2(code === 0));
    child.on("error", () => resolve2(false));
  });
}
function resolveBaseBranch(configBase, frontmatterBase) {
  return frontmatterBase != null && frontmatterBase.length > 0 ? frontmatterBase : configBase;
}
function gitCapture(repoRoot, args2) {
  return new Promise((resolve2, reject) => {
    const child = spawn2("git", args2, { cwd: repoRoot, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve2(stdout);
      else reject(new Error("git " + args2.join(" ") + " failed: " + stderr));
    });
    child.on("error", (e) => reject(e));
  });
}
async function listCycleBranches(repoRoot) {
  const raw = await gitCapture(repoRoot, [
    "for-each-ref",
    "--format=%(refname:short)	%(objectname:short)	%(subject)",
    "refs/heads/cycle/"
  ]);
  return raw.split("\n").filter(Boolean).map((line) => {
    const [branch, head_sha, ...rest] = line.split("	");
    return { branch, head_sha, last_commit_subject: rest.join("	") };
  });
}
async function deleteBranch(repoRoot, branch) {
  await git(repoRoot, ["branch", "-D", branch]);
}
async function isWorkingTreeDirty(repoRoot) {
  const out = await gitCapture(repoRoot, ["status", "--porcelain"]);
  return out.trim().length > 0;
}
var init_branch = __esm({
  "src/engine/branch.ts"() {
    "use strict";
  }
});

// src/engine/path-utils.ts
function isDenied(p) {
  const q2 = p.replace(/\/$/, "");
  for (const prefix of DENYLIST_PREFIXES) {
    if (q2 === prefix || q2.startsWith(prefix + "/")) return true;
  }
  if (DENYLIST_EXACT.includes(q2)) return true;
  if (q2.endsWith(".lock")) return true;
  return false;
}
var DENYLIST_PREFIXES, DENYLIST_EXACT;
var init_path_utils = __esm({
  "src/engine/path-utils.ts"() {
    "use strict";
    DENYLIST_PREFIXES = [".claude", "dist", "node_modules"];
    DENYLIST_EXACT = [".cycle/cycle.pid"];
  }
});

// src/cli/init.ts
var init_exports = {};
__export(init_exports, {
  locateDefaultsDir: () => locateDefaultsDir,
  locateEngineBundle: () => locateEngineBundle,
  runInit: () => runInit
});
import { cp, mkdir as mkdir6, stat as stat3, chmod, copyFile, writeFile as writeFile6 } from "node:fs/promises";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { dirname as dirname4, join as join17 } from "node:path";
async function runInit(opts) {
  const t = opts.targetRoot;
  const enginePath = await locateEngineBundle();
  await mkdir6(join17(t, ".cycle/bin"), { recursive: true });
  await copyFile(enginePath, join17(t, ".cycle/bin/cycle.js"));
  await chmod(join17(t, ".cycle/bin/cycle.js"), 493);
  await writeFile6(
    join17(t, ".cycle/package.json"),
    JSON.stringify({ type: "module", private: true }, null, 2) + "\n"
  );
  const defaults = await locateDefaultsDir();
  await mkdir6(join17(t, ".cycle"), { recursive: true });
  await copyFile(join17(defaults, "workflows.yml"), join17(t, ".cycle/workflows.yml"));
  await cp(join17(defaults, "prompts"), join17(t, ".cycle/prompts"), { recursive: true });
  await cp(join17(defaults, "scripts"), join17(t, ".cycle/scripts"), { recursive: true });
  for (const sub of ["ideas", "inbox", "todo", "done", "blocked", "failed"]) {
    await mkdir6(join17(t, "docs/cycle/issues", sub), { recursive: true });
  }
}
async function locateEngineBundle() {
  const candidates = [
    join17(HERE, "..", "..", "dist", "cycle.js"),
    join17(HERE, "..", "dist", "cycle.js"),
    join17(HERE, "cycle.js")
  ];
  for (const c of candidates) {
    try {
      await stat3(c);
      return c;
    } catch {
    }
  }
  throw new Error("init: could not locate dist/cycle.js");
}
async function locateDefaultsDir() {
  const candidates = [
    join17(HERE, "defaults"),
    // dist/defaults next to dist/cycle.js
    join17(HERE, "..", "defaults"),
    // dist/../defaults
    join17(HERE, "..", "..", "src", "defaults"),
    // local dev from src/cli/
    join17(HERE, "..", "src", "defaults")
    // local dev from src/
  ];
  for (const c of candidates) {
    try {
      await stat3(c);
      return c;
    } catch {
    }
  }
  throw new Error(`init: could not locate defaults; tried ${candidates.join(", ")}`);
}
var HERE;
var init_init = __esm({
  "src/cli/init.ts"() {
    "use strict";
    HERE = dirname4(fileURLToPath2(import.meta.url));
  }
});

// src/cli/upgrade.ts
var upgrade_exports = {};
__export(upgrade_exports, {
  runUpgrade: () => runUpgrade
});
import { cp as cp2, mkdir as mkdir7, stat as stat4, chmod as chmod2, copyFile as copyFile2, writeFile as writeFile7, rm } from "node:fs/promises";
import { join as join18 } from "node:path";
async function runUpgrade(opts) {
  const { targetRoot: t, argv: argv2 } = opts;
  const unknown = argv2.filter((a) => a.startsWith("-") && !KNOWN_FLAGS.includes(a));
  if (unknown.length > 0) {
    return { exitCode: 1, stdout: "", stderr: "Unknown flag(s): " + unknown.join(", ") };
  }
  const all = argv2.includes("--overwrite-all");
  const owPrompts = all || argv2.includes("--overwrite-prompts");
  const owWorkflows = all || argv2.includes("--overwrite-workflows");
  const owScripts = all || argv2.includes("--overwrite-scripts");
  try {
    const sb = await stat4(join18(t, ".cycle"));
    if (!sb.isDirectory()) throw new Error("not a directory");
  } catch {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "cycle upgrade: no .cycle/ found in " + t + " \u2014 run `cycle init` first."
    };
  }
  const enginePath = await locateEngineBundle();
  const defaults = await locateDefaultsDir();
  await mkdir7(join18(t, ".cycle/bin"), { recursive: true });
  await copyFile2(enginePath, join18(t, ".cycle/bin/cycle.js"));
  await chmod2(join18(t, ".cycle/bin/cycle.js"), 493);
  await writeFile7(
    join18(t, ".cycle/package.json"),
    JSON.stringify({ type: "module", private: true }, null, 2) + "\n"
  );
  const refreshed = [".cycle/bin/cycle.js", ".cycle/package.json"];
  const preserved = [];
  const overwritten = [];
  if (owWorkflows) {
    await copyFile2(join18(defaults, "workflows.yml"), join18(t, ".cycle/workflows.yml"));
    overwritten.push(".cycle/workflows.yml");
  } else {
    preserved.push(".cycle/workflows.yml");
  }
  for (const [flag, name] of [
    [owPrompts, "prompts"],
    [owScripts, "scripts"]
  ]) {
    const dest = join18(t, ".cycle", name);
    if (flag) {
      await rm(dest, { recursive: true, force: true });
      await cp2(join18(defaults, name), dest, { recursive: true });
      overwritten.push(`.cycle/${name}/`);
    } else {
      preserved.push(`.cycle/${name}/`);
    }
  }
  const lines = [
    "cycle upgrade complete.",
    "  Refreshed (engine): " + refreshed.join(", ")
  ];
  if (overwritten.length) {
    lines.push("  Overwritten (from defaults): " + overwritten.join(", "));
  }
  if (preserved.length) {
    lines.push("  Preserved (user config): " + preserved.join(", "));
  }
  lines.push(
    "  Untouched (state): .cycle/.env, .cycle/tbd.jsonl, .cycle/log.jsonl, docs/cycle/issues/**"
  );
  return { exitCode: 0, stdout: lines.join("\n") + "\n", stderr: "" };
}
var KNOWN_FLAGS;
var init_upgrade = __esm({
  "src/cli/upgrade.ts"() {
    "use strict";
    init_init();
    KNOWN_FLAGS = [
      "--overwrite-prompts",
      "--overwrite-workflows",
      "--overwrite-scripts",
      "--overwrite-all"
    ];
  }
});

// src/cli/status.ts
var status_exports = {};
__export(status_exports, {
  ISSUE_FOLDERS: () => ISSUE_FOLDERS,
  runStatus: () => runStatus
});
import { readdir as readdir3 } from "node:fs/promises";
import { join as join19 } from "node:path";
async function countMd(dir) {
  try {
    const entries = await readdir3(dir);
    return entries.filter((f) => f.endsWith(".md")).length;
  } catch (e) {
    if (e.code === "ENOENT") return 0;
    throw e;
  }
}
async function runStatus({ cwd: cwd2 }) {
  const counts = {
    raw: 0,
    todo: 0,
    done: 0,
    failed: 0,
    blocked: 0
  };
  for (const name of ISSUE_FOLDERS) {
    counts[name] = await countMd(join19(cwd2, "docs/cycle/issues", name));
  }
  const rows = await readQueue(cwd2);
  const pending = rows.filter((r) => r.status === "pending").length;
  const inProgress = rows.filter((r) => r.status === "in_progress");
  const tail = await readLogTail(cwd2);
  const lines = [];
  for (const name of ISSUE_FOLDERS) lines.push(`${name}: ${counts[name]}`);
  lines.push("");
  lines.push(`queue_total: ${rows.length}`);
  lines.push(`queue_pending: ${pending}`);
  lines.push(`queue_in_progress: ${inProgress.length}`);
  for (const r of inProgress) {
    lines.push(`  - id=${r.id} cycle_id=${r.cycle_id ?? "-"}`);
  }
  lines.push("");
  if (tail) {
    lines.push(`in_flight: ${tail.cycleId} step=${tail.lastStepStarted ?? "-"}`);
  } else {
    lines.push("in_flight: none");
  }
  return lines.join("\n");
}
var ISSUE_FOLDERS;
var init_status = __esm({
  "src/cli/status.ts"() {
    "use strict";
    init_queue();
    init_log_tail();
    ISSUE_FOLDERS = ["raw", "todo", "done", "failed", "blocked"];
  }
});

// src/cli/triage.ts
var triage_exports = {};
__export(triage_exports, {
  runCliTriage: () => runCliTriage,
  runCliTriageWithDeps: () => runCliTriageWithDeps
});
async function runCliTriageWithDeps(repoRoot, argv2, deps) {
  if (argv2.includes("--help") || argv2.includes("-h")) {
    return { exitCode: 0, stdout: HELP + "\n" };
  }
  if (!argv2.includes("--dry-run")) {
    return { exitCode: 2, stdout: "", stderr: HELP };
  }
  const cfg2 = await loadConfig(repoRoot);
  const reports = await dryRunTriage(repoRoot, cfg2, deps);
  const anyFailed = reports.some((r) => r.status === "failed");
  return {
    exitCode: anyFailed ? 1 : 0,
    stdout: JSON.stringify(reports, null, 2) + "\n"
  };
}
async function runCliTriage(repoRoot, argv2) {
  return runCliTriageWithDeps(repoRoot, argv2, {});
}
var HELP;
var init_triage2 = __esm({
  "src/cli/triage.ts"() {
    "use strict";
    init_workflow();
    init_triage();
    HELP = `Usage: cycle triage --dry-run [--help]

Re-run the configured triage agent against every file in
docs/cycle/issues/inbox/ and print a per-raw report as JSON.

The --dry-run mode performs no engine-side filesystem mutations:
  - no writes under docs/cycle/issues/{raw,todo,done,failed}
  - no appends/rewrites to .cycle/tbd.jsonl
  - no writes to .cycle/log.jsonl

The triage agent itself is still invoked, so the agent binary's own
behavior is out of scope of this guarantee.

Exits 0 if every raw passed validation, 1 otherwise.

Note: cycle triage without --dry-run is not implemented; real triage
runs as part of \`cycle run\`.`;
  }
});

// src/engine/shell.ts
function resolveShell(input) {
  const cfg2 = input.config;
  if (typeof cfg2 === "string" && cfg2.trim() !== "") return { ok: true, path: cfg2 };
  const envShell = input.env.CYCLE_SHELL;
  if (typeof envShell === "string" && envShell.trim() !== "") return { ok: true, path: envShell };
  if (input.platform !== "win32") return { ok: true, path: POSIX_DEFAULT_SHELL };
  for (const cand of WINDOWS_SHELL_CANDIDATES) {
    if (input.existsSync(cand)) return { ok: true, path: cand };
  }
  return {
    ok: false,
    searched: [...WINDOWS_SHELL_CANDIDATES],
    message: "cycle: no POSIX shell found for bash steps on Windows. Searched:\n" + WINDOWS_SHELL_CANDIDATES.map((p) => `  - ${p}`).join("\n") + "\nFix: install Git for Windows (git-bash) or WSL, or set engine.shell in .cycle/workflows.yml or the CYCLE_SHELL environment variable to a bash path."
  };
}
var WINDOWS_SHELL_CANDIDATES, POSIX_DEFAULT_SHELL;
var init_shell = __esm({
  "src/engine/shell.ts"() {
    "use strict";
    WINDOWS_SHELL_CANDIDATES = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
      "C:\\Windows\\System32\\bash.exe"
    ];
    POSIX_DEFAULT_SHELL = "/bin/bash";
  }
});

// src/engine/exec-bash.ts
import { spawn as spawn3 } from "node:child_process";
import { existsSync as existsSync2 } from "node:fs";
import { join as join20 } from "node:path";
function execBashStep(repoRoot, command, env, shell = resolveShell({
  platform: process.platform,
  env: process.env,
  existsSync: existsSync2
})) {
  return new Promise((resolve2) => {
    if (!shell.ok) {
      resolve2({ status: "failed", exitCode: 1, stdout: "", stderr: shell.message });
      return;
    }
    const abs = join20(repoRoot, ".cycle", command);
    const child = spawn3(shell.path, [abs], {
      cwd: repoRoot,
      env: buildChildEnv(env),
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => resolve2({ status: "failed", exitCode: -1, stdout, stderr: stderr + String(err) }));
    child.on("close", (code) => {
      resolve2({
        status: code === 0 ? "ok" : "failed",
        exitCode: code ?? -1,
        stdout,
        stderr
      });
    });
  });
}
var init_exec_bash = __esm({
  "src/engine/exec-bash.ts"() {
    "use strict";
    init_child_env();
    init_shell();
  }
});

// src/engine/reflection.ts
import { mkdir as mkdir8, readdir as readdir4, readFile as readFile12, rename as rename6, unlink as unlink3, writeFile as writeFile8 } from "node:fs/promises";
import { dirname as dirname5, join as join21 } from "node:path";
async function ingestReflection(repoRoot, cycleId, _cycleSlug, stdout, log2, artifactDir, touchedJsonPath) {
  const rawDir2 = join21(repoRoot, "docs/cycle/issues/inbox");
  const todoDir2 = join21(repoRoot, "docs/cycle/issues/todo");
  const discussDir = join21(repoRoot, "docs/cycle/issues/ideas");
  await mkdir8(rawDir2, { recursive: true });
  const existing = await readdir4(rawDir2);
  const re = new RegExp(`^refl-${cycleId}-.+\\.md$`);
  for (const name of existing) {
    if (re.test(name)) {
      try {
        await unlink3(join21(rawDir2, name));
      } catch {
      }
    }
  }
  const parseRes = parseWithRepair(stdout.trim());
  if (!parseRes.ok) {
    const id = await writeParseError(rawDir2, cycleId, stdout);
    await log2.emit("reflection.skipped", {
      cycle_id: cycleId,
      reason: "parse_error",
      message: parseRes.message
    });
    await log2.emit("reflection.summary", {
      cycle_id: cycleId,
      count: 0,
      skipped: 1
    });
    return { written: [id], skipped: 1, fixNow: 0 };
  }
  const parsed = parseRes.value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.sharp_edges)) {
    await log2.emit("reflection.skipped", {
      cycle_id: cycleId,
      reason: "parse_error",
      message: "missing sharp_edges array"
    });
    return { written: [], skipped: 0, fixNow: 0 };
  }
  const entries = parsed.sharp_edges;
  let touchedFiles = [];
  try {
    const tj = JSON.parse(await readFile12(touchedJsonPath, "utf8"));
    if (Array.isArray(tj.files)) touchedFiles = tj.files;
  } catch {
  }
  const logPath2 = join21(repoRoot, ".cycle", "log.jsonl");
  const scopeWarnings = await readScopeWarnings(logPath2, cycleId);
  const syntheticEntries = scopeWarnings.map((files) => ({
    title: `scope-warning cleanup: ${files.slice(0, 3).join(", ")}${files.length > 3 ? " \u2026" : ""}`,
    body: `Files committed outside the cycle footprint: ${files.join(", ")}. These files were not tracked in touched.json. Investigate whether touched.json accumulation needs updating or whether the commit included unintended changes.`,
    bucket: "defer",
    priority: "low"
  }));
  const dedupeMap = await buildDedupeMap(rawDir2, todoDir2, discussDir);
  const written = [];
  let skipped = 0;
  let fixNow = 0;
  let deferredCount = 0;
  let capDropped = 0;
  let dedupSkipped = 0;
  let validationSkipped = 0;
  const usedSlugs = /* @__PURE__ */ new Set();
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const fixNowItems = [];
  const allEntries = [...entries, ...syntheticEntries];
  for (let i = 0; i < allEntries.length; i++) {
    const raw = allEntries[i];
    const invalid = validateEntry(raw);
    if (invalid) {
      await log2.emit("reflection.skipped", {
        cycle_id: cycleId,
        reason: "invalid_entry",
        entry_index: i,
        field: invalid
      });
      skipped++;
      validationSkipped++;
      continue;
    }
    const e = raw;
    if (e.bucket === "fix_now") {
      fixNowItems.push(e);
      fixNow++;
      await log2.emit("reflection.fix_now_written", {
        cycle_id: cycleId,
        title: e.title,
        index: fixNowItems.length - 1
      });
      continue;
    }
    let slug = slugify(e.title);
    if (slug === "") slug = "entry";
    let unique = slug;
    let n = 2;
    while (usedSlugs.has(unique)) {
      unique = `${slug}-${n}`;
      n++;
    }
    usedSlugs.add(unique);
    const id = `refl-${cycleId}-${unique}`;
    const existingIn = dedupeMap.get(id);
    if (existingIn !== void 0) {
      await log2.emit("reflection.dedup_skipped", {
        cycle_id: cycleId,
        id,
        existing_in: existingIn
      });
      dedupSkipped++;
      continue;
    }
    if (deferredCount >= DEFERRED_CAP) {
      capDropped++;
      await log2.emit("reflection.cap_reached", {
        cycle_id: cycleId,
        title: e.title,
        bucket: e.bucket,
        dropped_count: capDropped
      });
      continue;
    }
    const priority = e.bucket === "idea" ? "idea" : e.priority ?? "medium";
    const content = serializeFrontmatter(
      {
        id,
        source: "reflection",
        title: e.title,
        added_at: nowIso,
        triage_attempts: 0,
        priority,
        origin_cycle_id: cycleId
      },
      "\n" + e.body + "\n"
    );
    await atomicWrite2(join21(rawDir2, `${id}.md`), content);
    written.push(id);
    deferredCount++;
    await log2.emit("reflection.deferred_issue_written", {
      cycle_id: cycleId,
      raw_id: id,
      title: e.title,
      bucket: e.bucket,
      priority
    });
  }
  if (fixNowItems.length > 0) {
    const content = buildFinalFixesContent(cycleId, fixNowItems, touchedFiles);
    await atomicWrite2(join21(artifactDir, "FINAL_FIXES.md"), content);
  }
  const reflContent = buildReflectionContent(cycleId, allEntries.length, {
    fixNow,
    deferred: deferredCount,
    dedupSkipped,
    capDropped,
    validationSkipped
  });
  await atomicWrite2(join21(artifactDir, "REFLECTION.md"), reflContent);
  await log2.emit("reflection.summary", {
    cycle_id: cycleId,
    count: written.length,
    skipped,
    fix_now: fixNow,
    cap_dropped: capDropped,
    dedup_skipped: dedupSkipped
  });
  return { written, skipped, fixNow };
}
async function readScopeWarnings(logPath2, cycleId) {
  try {
    const text = await readFile12(logPath2, "utf8");
    const results = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.event === "commit.scope_warning" && ev.cycle_id === cycleId && Array.isArray(ev.files)) {
          results.push(ev.files);
        }
      } catch {
      }
    }
    return results;
  } catch {
    return [];
  }
}
async function buildDedupeMap(rawDir2, todoDir2, discussDir) {
  const map = /* @__PURE__ */ new Map();
  for (const [dir, label] of [
    [rawDir2, "raw"],
    [todoDir2, "todo"],
    [discussDir, "idea"]
  ]) {
    try {
      const entries = await readdir4(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isFile() && ent.name.endsWith(".md")) {
          map.set(ent.name.slice(0, -3), label);
        }
      }
    } catch {
    }
  }
  return map;
}
function buildFinalFixesContent(cycleId, fixes, touchedFiles) {
  const header = touchedFiles.length > 0 ? `> Footprint: ${touchedFiles.join(", ")}` : `> Footprint: unknown \u2014 touched.json absent`;
  const items = fixes.map((f, i) => `## Fix ${i + 1}: ${f.title}

${f.body}`).join("\n\n---\n\n");
  return `# Final Fixes \u2014 Cycle ${cycleId}

${header}

${items}
`;
}
function buildReflectionContent(cycleId, edgeCount, routing) {
  return [
    `# Reflection \u2014 Cycle ${cycleId}`,
    "",
    `Sharp edges surfaced: ${edgeCount}`,
    "",
    "## Routing Summary",
    "",
    "| Category | Count |",
    "|---|---|",
    `| fix_now | ${routing.fixNow} |`,
    `| deferred to inbox/ | ${routing.deferred} |`,
    `| dedup skipped | ${routing.dedupSkipped} |`,
    `| cap dropped | ${routing.capDropped} |`,
    `| validation skipped | ${routing.validationSkipped} |`,
    ""
  ].join("\n");
}
function parseWithRepair(s) {
  s = stripFences(s);
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e1) {
    let offset = 0;
    while (true) {
      const repaired = trimToLastBalancedClose(s, offset);
      if (repaired === null) return { ok: false, message: e1.message };
      try {
        return { ok: true, value: JSON.parse(repaired.slice) };
      } catch {
        offset = repaired.start + 1;
      }
    }
  }
}
function trimToLastBalancedClose(s, startOffset = 0) {
  let start = -1;
  for (let i = startOffset; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 123 || c === 91) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let lastIdx = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) lastIdx = i;
    }
  }
  if (lastIdx < 0) return null;
  return { slice: s.slice(start, lastIdx + 1), start };
}
function truncateUtf8(s, budget = TRUNC_BUDGET, marker = TRUNC_MARKER) {
  if (Buffer.byteLength(s, "utf8") <= budget) return s;
  const markerBytes = Buffer.byteLength(marker, "utf8");
  const cap = budget - markerBytes;
  let acc = 0;
  let cut = 0;
  for (const ch of s) {
    const n = Buffer.byteLength(ch, "utf8");
    if (acc + n > cap) break;
    acc += n;
    cut += ch.length;
  }
  return s.slice(0, cut) + marker;
}
async function writeParseError(rawDir2, cycleId, stdout) {
  const id = `refl-${cycleId}-parse-error`;
  const body = truncateUtf8(stdout);
  const content = serializeFrontmatter(
    {
      id,
      source: "reflection",
      title: "reflection stdout failed to parse",
      added_at: (/* @__PURE__ */ new Date()).toISOString(),
      triage_attempts: 0,
      priority: "high",
      origin_cycle_id: cycleId
    },
    "\n" + body + "\n"
  );
  await atomicWrite2(join21(rawDir2, `${id}.md`), content);
  return id;
}
function validateEntry(e) {
  if (!e || typeof e !== "object") return "entry";
  if (typeof e.title !== "string" || e.title.trim() === "") return "title";
  if (typeof e.body !== "string" || e.body.trim() === "") return "body";
  if (typeof e.bucket !== "string" || !VALID_BUCKETS.has(e.bucket)) return "bucket";
  if (e.bucket === "defer") {
    if (typeof e.priority !== "string" || !VALID_PRIORITIES.has(e.priority)) return "priority";
  }
  return null;
}
async function atomicWrite2(path, content) {
  await mkdir8(dirname5(path), { recursive: true });
  const tmp = path + ".tmp";
  await writeFile8(tmp, content, "utf8");
  try {
    await rename6(tmp, path);
  } catch (e) {
    try {
      await unlink3(tmp);
    } catch {
    }
    throw e;
  }
}
var TRUNC_BUDGET, TRUNC_MARKER, VALID_BUCKETS, VALID_PRIORITIES, DEFERRED_CAP;
var init_reflection = __esm({
  "src/engine/reflection.ts"() {
    "use strict";
    init_id();
    init_frontmatter();
    init_log_fmt();
    TRUNC_BUDGET = 8192;
    TRUNC_MARKER = "\n\u2026\n";
    VALID_BUCKETS = /* @__PURE__ */ new Set(["fix_now", "defer", "idea"]);
    VALID_PRIORITIES = /* @__PURE__ */ new Set(["low", "medium", "high", "critical"]);
    DEFERRED_CAP = 2;
  }
});

// src/engine/sanitize-artifact.ts
function sanitizeArtifactStdout(stdout) {
  let s = stdout.replace(/^\s+/, "");
  while (NARRATION_LINE.test(s)) {
    s = s.replace(NARRATION_LINE, "");
    while (BLANK_LINE.test(s)) s = s.replace(BLANK_LINE, "");
  }
  const fence = s.match(OUTER_FENCE);
  if (fence) s = fence[1];
  s = s.replace(/\s+$/, "");
  return s === "" ? "" : s + "\n";
}
var NARRATION_LINE, BLANK_LINE, OUTER_FENCE;
var init_sanitize_artifact = __esm({
  "src/engine/sanitize-artifact.ts"() {
    "use strict";
    NARRATION_LINE = /^(?:(?:Now|Next|Here is|Output)\b|[A-Za-z0-9_.]+\.md written to|Single deliverable:)[^\n]*(?:\n|$)/;
    BLANK_LINE = /^[^\S\n]*\n/;
    OUTER_FENCE = /^```(?:\w+)?\n([\s\S]*)\n```\s*$/;
  }
});

// src/engine/compress-filter.ts
function compressOutput(stdout, opts = {}) {
  const thresholdBytes = opts.thresholdBytes ?? DEFAULT_THRESHOLD_BYTES;
  const headLines = opts.headLines ?? DEFAULT_HEAD_LINES;
  const tailLines = opts.tailLines ?? DEFAULT_TAIL_LINES;
  if (Buffer.byteLength(stdout, "utf8") <= thresholdBytes) {
    return { text: stdout, compressed: false };
  }
  const lines = stdout.split("\n");
  if (lines.length <= headLines + tailLines) {
    return { text: stdout, compressed: false };
  }
  const head = lines.slice(0, headLines);
  const tail = lines.slice(lines.length - tailLines);
  const middle = lines.slice(headLines, lines.length - tailLines);
  const retained = middle.filter((l) => ERROR_LINE_PATTERN.test(l));
  const elided = middle.filter((l) => !ERROR_LINE_PATTERN.test(l));
  const elidedBytes = Buffer.byteLength(elided.join("\n"), "utf8");
  const marker = `[\u2026 ${elided.length} lines/${elidedBytes} bytes elided \u2026]`;
  const text = [...head, marker, ...retained, ...tail].join("\n");
  return { text, compressed: true };
}
function classifyCommand(command) {
  const c = command.trim();
  if (c.length === 0) return { rewrite: false };
  if (DENY_PATTERN.test(c)) return { rewrite: false };
  const first = c.split(/\s+/)[0];
  if (!ALLOWLIST.has(first)) return { rewrite: false };
  return { rewrite: true };
}
function q(s) {
  return `"${s}"`;
}
function buildRewriteCommand({ execPath, cliPath, command }) {
  return `${q(execPath)} ${q(cliPath)} compress-output -- ${command.trim()}`;
}
function buildCompressHookSettings({ execPath, cliPath }) {
  return {
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: `${q(execPath)} ${q(cliPath)} compress-output-hook`
            }
          ]
        }
      ]
    }
  };
}
var DEFAULT_THRESHOLD_BYTES, DEFAULT_HEAD_LINES, DEFAULT_TAIL_LINES, ALLOWLIST, DENY_PATTERN, ERROR_LINE_PATTERN;
var init_compress_filter = __esm({
  "src/engine/compress-filter.ts"() {
    "use strict";
    DEFAULT_THRESHOLD_BYTES = 4e3;
    DEFAULT_HEAD_LINES = 40;
    DEFAULT_TAIL_LINES = 20;
    ALLOWLIST = /* @__PURE__ */ new Set([
      "git",
      "ls",
      "cat",
      "grep",
      "rg",
      "diff",
      "head",
      "tail",
      "wc",
      "tree",
      "stat"
    ]);
    DENY_PATTERN = /[|&;<>$`(){}\n\r]/;
    ERROR_LINE_PATTERN = /\b(error|fatal|fail(ed|ure)?|denied|cannot|no such|warning)\b/i;
  }
});

// src/engine/noop-marker.ts
import { readFile as readFile13 } from "node:fs/promises";
function parseNoopMarker(content) {
  let reason;
  let evidenceCount = 0;
  for (const line of content.split("\n")) {
    const m = REASON_RE.exec(line);
    if (m && reason === void 0) {
      const r = m[1].toLowerCase();
      if (NOOP_REASONS.has(r)) reason = r;
    }
    if (EVIDENCE_RE.test(line)) evidenceCount++;
  }
  if (reason !== void 0 && evidenceCount >= 1) return { valid: true, reason };
  return { valid: false };
}
async function classifyNoopMarker(markerPath) {
  let content;
  try {
    content = await readFile13(markerPath, "utf8");
  } catch {
    return { valid: false };
  }
  return parseNoopMarker(content);
}
var NOOP_REASONS, EVIDENCE_RE, REASON_RE;
var init_noop_marker = __esm({
  "src/engine/noop-marker.ts"() {
    "use strict";
    NOOP_REASONS = /* @__PURE__ */ new Set([
      "already-satisfied",
      "duplicate",
      "not-actionable"
    ]);
    EVIDENCE_RE = /[\w./-]+\.\w+:\d+\b/;
    REASON_RE = /^\s*reason\s*:\s*([a-z-]+)\s*$/i;
  }
});

// src/engine/walkthrough.ts
import { spawn as spawn4 } from "node:child_process";
import { existsSync as existsSync3 } from "node:fs";
import { stat as stat5, readdir as readdir5, writeFile as writeFile9 } from "node:fs/promises";
import { join as join22, isAbsolute, relative } from "node:path";
function walkthroughManifestName(phase) {
  return phase ? `walkthrough-${phase}-artifacts.json` : WALKTHROUGH_MANIFEST;
}
async function resolveWalkthroughHook(repoRoot, cfg2) {
  const raw = cfg2.engine.walkthrough_hook;
  const configured = typeof raw === "string" && raw.trim() ? raw.trim() : void 0;
  const candidate = configured ? isAbsolute(configured) ? configured : join22(repoRoot, configured) : join22(repoRoot, ".cycle", "walkthrough.sh");
  try {
    const st = await stat5(candidate);
    if (st.isFile() && (st.mode & 73) !== 0) return candidate;
  } catch {
  }
  return null;
}
function execWalkthroughHook(repoRoot, hookAbsPath, env, opts = {}) {
  return new Promise((resolve2) => {
    const shell = opts.shell ?? resolveShell({
      platform: process.platform,
      env: process.env,
      existsSync: existsSync3
    });
    if (!shell.ok) {
      resolve2({ status: "failed", exitCode: 1, stdout: "", stderr: shell.message });
      return;
    }
    const child = spawn4(shell.path, [hookAbsPath], {
      cwd: repoRoot,
      env: buildChildEnv(env),
      shell: false,
      detached: true
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer = opts.timer ?? defaultTimer;
    let timeoutHandle;
    let killHandle;
    const done = (r) => {
      if (settled) return;
      settled = true;
      timeoutHandle?.clear();
      killHandle?.clear();
      resolve2(r);
    };
    const killTree = (sig) => {
      try {
        if (child.pid) process.kill(-child.pid, sig);
      } catch {
        try {
          child.kill(sig);
        } catch {
        }
      }
    };
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => done({ status: "failed", exitCode: -1, stdout, stderr: stderr + String(err) }));
    child.on("close", (code) => done(timedOut ? { status: "failed", exitCode: code ?? -1, stdout, stderr, timedOut: true } : { status: code === 0 ? "ok" : "failed", exitCode: code ?? -1, stdout, stderr }));
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timeoutHandle = timer(opts.timeoutMs, () => {
        timedOut = true;
        killTree("SIGTERM");
        killHandle = timer(WALKTHROUGH_KILL_GRACE_MS, () => killTree("SIGKILL"));
      });
    }
  });
}
async function collectWalkthroughMedia(artifactDir, phase) {
  const mediaDir = phase ? join22(artifactDir, WALKTHROUGH_MEDIA_DIRNAME, phase) : join22(artifactDir, WALKTHROUGH_MEDIA_DIRNAME);
  let entries;
  try {
    entries = await readdir5(mediaDir, { recursive: true, withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  return entries.filter((e) => e.isFile()).map((e) => relative(artifactDir, join22(e.parentPath ?? mediaDir, e.name))).sort();
}
async function writeWalkthroughManifest(artifactDir, media, phase) {
  const manifestPath = join22(artifactDir, walkthroughManifestName(phase));
  await writeFile9(manifestPath, JSON.stringify({ media, count: media.length }, null, 2), "utf8");
  return manifestPath;
}
var WALKTHROUGH_MEDIA_DIRNAME, WALKTHROUGH_MANIFEST, WALKTHROUGH_KILL_GRACE_MS, defaultTimer;
var init_walkthrough = __esm({
  "src/engine/walkthrough.ts"() {
    "use strict";
    init_child_env();
    init_shell();
    WALKTHROUGH_MEDIA_DIRNAME = "walkthrough";
    WALKTHROUGH_MANIFEST = "walkthrough-artifacts.json";
    WALKTHROUGH_KILL_GRACE_MS = 5e3;
    defaultTimer = (ms, cb) => {
      const t = setTimeout(cb, ms);
      if (t.unref) t.unref();
      return { clear: () => clearTimeout(t) };
    };
  }
});

// src/engine/run-cycle.ts
import { writeFile as writeFile10, readFile as readFile14, stat as stat6 } from "node:fs/promises";
import { existsSync as existsSync4 } from "node:fs";
import { join as join23 } from "node:path";
import { spawnSync as spawnSync5 } from "node:child_process";
function parseSnapshotPaths(snapshot) {
  const paths = /* @__PURE__ */ new Set();
  for (const raw of snapshot.split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy === "??") {
      const p2 = raw.slice(3).replace(/^"/, "").replace(/"$/, "");
      if (p2.startsWith("src/") || p2.startsWith("scripts/")) paths.add(p2);
      continue;
    }
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    paths.add(p);
  }
  return paths;
}
function resolveExpectsCode(fm) {
  return fm?.expects_code === false ? false : true;
}
function parseDocDeliverablePaths(stdout) {
  const out = [];
  for (const raw of (stdout ?? "").split("\n")) {
    if (!raw.trim()) continue;
    const xy = raw.slice(0, 2);
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    if (!p.startsWith("docs/")) continue;
    if (isDenied(p) || p.startsWith("docs/cycle/")) continue;
    out.push(p);
  }
  return out;
}
function parseTouchedFilesSection(text) {
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim() === "## Touched Files");
  if (headerIdx === -1) return /* @__PURE__ */ new Set();
  const out = /* @__PURE__ */ new Set();
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("##")) break;
    const m = /^\s*-\s+(.+)/.exec(lines[i]);
    if (m) out.add(m[1].trim());
  }
  return out;
}
async function appendDocumentationPaths(repoRoot, buildMdPath, log2, cycleId, preSnapshot) {
  let text;
  try {
    text = await readFile14(buildMdPath, "utf8");
  } catch {
    return;
  }
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim() === "## Touched Files");
  if (headerIdx === -1) return;
  const touchedSet = parseTouchedFilesSection(text);
  const prePaths = parseSnapshotPaths(preSnapshot);
  const result = spawnSync5("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false
  });
  const toAppend = Array.from(parseSnapshotPaths(result.stdout ?? "")).filter((p) => !isDenied(p) && !prePaths.has(p) && !touchedSet.has(p));
  if (toAppend.length === 0) return;
  let insertIdx = lines.length;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("##")) {
      insertIdx = i;
      break;
    }
  }
  while (insertIdx > headerIdx + 1 && lines[insertIdx - 1].trim() === "") {
    insertIdx--;
  }
  lines.splice(insertIdx, 0, ...toAppend.map((p) => `- ${p}`));
  await writeFile10(buildMdPath, lines.join("\n"), "utf8");
  await log2.emit("documentation.paths_appended", { cycle_id: cycleId, appended: toAppend });
}
async function accumulateTouchedFiles(repoRoot, artifactDir, preSnapshot) {
  const prePaths = parseSnapshotPaths(preSnapshot);
  const post = spawnSync5("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false
  });
  const newFiles = Array.from(parseSnapshotPaths(post.stdout ?? "")).filter((p) => !isDenied(p) && !prePaths.has(p));
  const touchedPath = join23(artifactDir, "touched.json");
  let existing = [];
  try {
    const raw = await readFile14(touchedPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.files)) existing = parsed.files;
  } catch {
  }
  const merged = Array.from(/* @__PURE__ */ new Set([...existing, ...newFiles])).sort();
  await writeFile10(touchedPath, JSON.stringify({ files: merged }, null, 2) + "\n", "utf8");
}
async function recoverTouchedFiles(repoRoot, artifactDir, log2, cycleId) {
  const touchedPath = join23(artifactDir, "touched.json");
  let existing = [];
  try {
    const raw = await readFile14(touchedPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.files)) existing = parsed.files;
  } catch {
  }
  if (existing.length > 0) return;
  let declared = /* @__PURE__ */ new Set();
  try {
    declared = parseTouchedFilesSection(await readFile14(join23(artifactDir, "BUILD.md"), "utf8"));
  } catch {
  }
  const status = spawnSync5("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", shell: false });
  const current = status.status === 0 ? parseSnapshotPaths(status.stdout ?? "") : /* @__PURE__ */ new Set();
  const merged = Array.from(/* @__PURE__ */ new Set([...declared, ...current])).filter((p) => !isDenied(p)).sort();
  if (merged.length === 0) {
    await log2.emit("engine.warning", { reason: "touched_recovery_empty", cycle_id: cycleId });
    return;
  }
  try {
    await writeFile10(touchedPath, JSON.stringify({ files: merged }, null, 2) + "\n", "utf8");
  } catch {
    await log2.emit("engine.warning", { reason: "touched_recovery_write_failed", cycle_id: cycleId });
    return;
  }
  await log2.emit("touched.recovered", { cycle_id: cycleId, source: TOUCHED_RECOVERY_SOURCE, count: merged.length });
}
async function classifyArtifact(artifactPath) {
  try {
    const content = await readFile14(artifactPath, "utf8");
    return content.trim().length === 0 ? "empty" : "nonempty";
  } catch {
    return "empty";
  }
}
async function shouldSkipForArtifact(artifactDir, stepName) {
  if (!SKIP_ELIGIBLE_STEPS.has(stepName)) return { skip: false };
  const artifactPath = join23(artifactDir, `${stepName.toUpperCase()}.md`);
  if (await classifyArtifact(artifactPath) === "nonempty") return { skip: true, artifactPath };
  return { skip: false };
}
function formatSpecGuardError(path, bytes, threshold) {
  return `spec post-condition failed: ${path} is ${bytes} bytes (< ${threshold})`;
}
function formatFixGuardError(fixPath, mustFixPath, count) {
  return `fix step produced empty FIX.md while MUST-FIX.md has ${count} task(s) [fix: ${fixPath}, must-fix: ${mustFixPath}]`;
}
function formatEmptyDiffGuardError(stepName) {
  return `${stepName} post-condition failed: no code changes detected (step reported ok but git status --porcelain -- src scripts tests is empty)`;
}
function formatCompletionProofError(stepName, artifactPath) {
  return `${stepName} exited 0 but ${artifactPath} is empty \u2014 treating as failure`;
}
function formatTimeoutProofError(stepName, artifactPath, exitCode) {
  return `${stepName} timed out (exit ${exitCode}) and left ${artifactPath} empty \u2014 treating as failure`;
}
function formatWalkthroughTimeoutError(stepName, exitCode) {
  return `${stepName} timed out (exit ${exitCode}) \u2014 hook killed (SIGTERM\u2192SIGKILL) \u2014 treating as failure`;
}
async function findPriorStepHeadSha(repoRoot, cycleId, stepName) {
  let text;
  try {
    text = await readFile14(join23(repoRoot, ".cycle", "log.jsonl"), "utf8");
  } catch {
    return null;
  }
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.event !== "step.start") continue;
    if (ev.step !== stepName) continue;
    if (ev.cycle_id !== cycleId) continue;
    return typeof ev.head_sha === "string" ? ev.head_sha : "missing";
  }
  return null;
}
async function runCycle(repoRoot, opts) {
  const cycleId = opts.cycleId ?? await allocateCycleId(repoRoot);
  const log2 = await createLogger(repoRoot);
  const slug = slugify(opts.title);
  const mergedEnv = opts.env ? { ...process.env, ...opts.env } : void 0;
  const cfg2 = await loadConfig(repoRoot, mergedEnv);
  const wf = cfg2.workflows.find((w) => w.name === opts.workflow);
  if (!wf) throw new Error(`unknown workflow: ${opts.workflow}`);
  let artifactDir;
  if (opts.resume) {
    await log2.emit("cycle.resume", {
      cycle_id: cycleId,
      workflow: opts.workflow,
      title: opts.title,
      issue_id: opts.issueId,
      start_step_index: opts.resume.startStepIndex
    });
    if (cfg2.engine.commit.mode !== "worktree-pr") {
      ({ artifactDir } = await prepareTrunkArtifactDir(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    } else {
      ({ artifactDir } = await checkoutCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    }
  } else {
    await log2.emit("cycle.start", { cycle_id: cycleId, workflow: opts.workflow, title: opts.title, issue_id: opts.issueId });
    if (cfg2.engine.commit.mode !== "worktree-pr") {
      ({ artifactDir } = await prepareTrunkArtifactDir(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    } else {
      ({ artifactDir } = await createCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    }
  }
  const cycleEnv = {
    CYCLE_ID: cycleId,
    CYCLE_TITLE: opts.title,
    CYCLE_BASE: process.env.CYCLE_BASE ?? resolveBaseBranch(cfg2.engine.base_branch, opts.baseBranch),
    ...opts.issueId ? { CYCLE_ISSUE_ID: opts.issueId } : {},
    ...opts.env ?? {}
  };
  const sleepFn = opts.sleepFn ?? ((ms) => new Promise((resolve2) => setTimeout(resolve2, ms)));
  const nowFn = opts.nowFn ?? (() => Date.now());
  try {
    const startIdx = opts.resume?.startStepIndex ?? 0;
    if (opts.resume) {
      const maxResetIdx = wf.steps.reduce(
        (max, s, idx) => RESET_ELIGIBLE_STEPS.has(s.name) ? idx : max,
        -1
      );
      if (maxResetIdx >= 0 && startIdx > maxResetIdx) {
        try {
          await recoverTouchedFiles(repoRoot, artifactDir, log2, cycleId);
        } catch {
        }
      }
    }
    const attempt = opts.attempt ?? 0;
    const skipEnabled = opts.skipCompletedOnRetry !== false;
    for (let i = startIdx; i < wf.steps.length; i++) {
      const step = wf.steps[i];
      const stepStart = nowFn();
      let headSha = null;
      const isResetEligible = RESET_ELIGIBLE_STEPS.has(step.name);
      const isResumeEntry = !!opts.resume && i === startIdx;
      if (attempt > 0 && skipEnabled && !isResumeEntry && step.agent !== "bash") {
        const gate = await shouldSkipForArtifact(artifactDir, step.name);
        if (gate.skip) {
          await log2.emit("step.skipped", {
            cycle_id: cycleId,
            step: step.name,
            reason: "artifact_present",
            artifact_path: gate.artifactPath
          });
          continue;
        }
      }
      if (step.skip_unless) {
        const guardPath = join23(artifactDir, step.skip_unless);
        let present = false;
        try {
          const st = await stat6(guardPath);
          present = st.isFile();
        } catch {
        }
        if (!present) {
          await log2.emit("step.end", {
            cycle_id: cycleId,
            step: step.name,
            status: "skipped",
            reason: "skip_unless_artifact_missing",
            artifact: step.skip_unless,
            duration_ms: Math.max(0, Math.round(nowFn() - stepStart))
          });
          continue;
        }
      }
      if (WALKTHROUGH_PHASES.has(step.name)) {
        const phase = WALKTHROUGH_PHASES.get(step.name);
        const hook = await resolveWalkthroughHook(repoRoot, cfg2);
        if (!hook) {
          await log2.emit("step.end", {
            cycle_id: cycleId,
            step: step.name,
            status: "skipped",
            reason: "walkthrough_hook_absent",
            duration_ms: Math.max(0, Math.round(nowFn() - stepStart))
          });
          continue;
        }
        await log2.emit("step.start", { cycle_id: cycleId, step: step.name, agent: "bash" });
        const rawWtTimeout = cfg2.engine.walkthrough_hook_timeout_ms;
        const walkthroughTimeoutMs = typeof rawWtTimeout === "number" && Number.isInteger(rawWtTimeout) && rawWtTimeout > 0 ? rawWtTimeout : 0;
        const wtShell = resolveShell({ platform: process.platform, env: process.env, config: cfg2.engine.shell, existsSync: existsSync4 });
        const wr = await execWalkthroughHook(
          repoRoot,
          hook,
          { ...cycleEnv, CYCLE_ARTIFACT_DIR: artifactDir, ...phase ? { CYCLE_WALKTHROUGH_PHASE: phase } : {} },
          { timeoutMs: walkthroughTimeoutMs, shell: wtShell }
        );
        if (wr.status === "failed") {
          const failStderr = wr.timedOut ? truncateHeadCapped(`${formatWalkthroughTimeoutError(step.name, wr.exitCode)}
${wr.stderr}`, MAX_STEP_END_STDERR) : truncateHeadCapped(wr.stderr, MAX_STEP_END_STDERR);
          await log2.emit("step.end", {
            cycle_id: cycleId,
            step: step.name,
            status: "failed",
            exit_code: wr.exitCode,
            duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
            stderr: failStderr
          });
          await log2.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
          return { cycleId, artifactDir, status: "failed", failingStep: step.name };
        }
        let walkthroughArtifact;
        try {
          const media = await collectWalkthroughMedia(artifactDir, phase);
          if (media.length > 0) {
            walkthroughArtifact = await writeWalkthroughManifest(artifactDir, media, phase);
          }
        } catch (err) {
          await log2.emit("step.walkthrough_capture_failed", {
            cycle_id: cycleId,
            step: step.name,
            artifact: join23(artifactDir, walkthroughManifestName(phase)),
            error: err instanceof Error ? err.message : String(err)
          });
        }
        await log2.emit("step.end", {
          cycle_id: cycleId,
          step: step.name,
          status: "ok",
          exit_code: wr.exitCode,
          duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
          ...walkthroughArtifact ? { walkthrough_artifacts: walkthroughArtifact } : {}
        });
        continue;
      }
      if (isResetEligible && cfg2.engine.commit.mode === "worktree-pr") {
        if (!isResumeEntry) {
          headSha = await revParseHead(repoRoot);
        } else {
          const prior = await findPriorStepHeadSha(repoRoot, cycleId, step.name);
          if (prior === null || prior === "missing") {
            await log2.emit("step.warning", { cycle_id: cycleId, step: step.name, reason: `${step.name}_pre_sha_missing` });
            headSha = await revParseHead(repoRoot);
          } else if (!await shaExists(repoRoot, prior)) {
            await log2.emit("step.warning", { cycle_id: cycleId, step: step.name, reason: `${step.name}_pre_sha_unreachable`, sha: prior });
            headSha = await revParseHead(repoRoot);
          } else {
            const { cleanWarning } = await resetCycleBranchTo(repoRoot, prior);
            if (cleanWarning) {
              await log2.emit("step.warning", { cycle_id: cycleId, step: step.name, reason: "clean_failed", detail: cleanWarning });
            }
            headSha = prior;
          }
        }
      }
      await log2.emit("step.start", {
        cycle_id: cycleId,
        step: step.name,
        agent: step.agent,
        ...headSha ? { head_sha: headSha } : {}
      });
      let preSnapshot = "";
      if (step.name === "documentation" || RESET_ELIGIBLE_STEPS.has(step.name)) {
        const snap = spawnSync5("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", shell: false });
        preSnapshot = snap.stdout ?? "";
      }
      const appendSP = step.agent !== "bash" && ARTIFACT_STEPS.has(step.name ?? "") ? ARTIFACT_SUPPRESS_PROMPT : void 0;
      if (appendSP !== void 0 && step.agent !== "claudecode") {
        await log2.emit("step.warning", {
          cycle_id: cycleId,
          step: step.name,
          reason: "append_system_prompt_ignored",
          agent: step.agent
        });
      }
      let settingsPath;
      if (cfg2.engine.compress_output === true && step.agent === "claudecode") {
        try {
          const obj = buildCompressHookSettings({ execPath: process.execPath, cliPath: process.argv[1] });
          const p = join23(repoRoot, ".cycle", "compress-hook-settings.json");
          await writeFile10(p, JSON.stringify(obj, null, 2), "utf8");
          settingsPath = p;
        } catch (err) {
          await log2.emit("step.warning", {
            cycle_id: cycleId,
            step: step.name,
            reason: "compress_hook_settings_failed",
            error: err.message
          });
        }
      }
      let r = { status: "failed", exitCode: -1, stdout: "", stderr: "" };
      let noopOutcome = null;
      let wasRateLimited = false;
      let rateLimitRetries = 0;
      const rawCap = cfg2.engine.max_rate_limit_retries;
      const maxRateLimitRetries = typeof rawCap === "number" && Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 24;
      while (true) {
        if (step.agent === "bash") {
          const bashShell = resolveShell({ platform: process.platform, env: process.env, config: cfg2.engine.shell, existsSync: existsSync4 });
          r = await execBashStep(repoRoot, step.command, cycleEnv, bashShell);
        } else {
          try {
            const mod = resolveAgent(step.agent);
            r = await mod.runStep({
              repoRoot,
              promptPath: step.prompt,
              env: cycleEnv,
              model: step.model,
              thinking: step.thinking,
              appendSystemPrompt: appendSP,
              timeoutMs: cfg2.engine.step_timeout_ms,
              settingsPath
            });
          } catch (err) {
            if (err instanceof UnknownAgentError) {
              r = { status: "failed", exitCode: -1, stdout: "", stderr: err.message };
            } else {
              throw err;
            }
          }
        }
        if (r.rateLimited) {
          rateLimitRetries++;
          if (rateLimitRetries > maxRateLimitRetries) {
            await log2.emit("step.end", {
              cycle_id: cycleId,
              step: step.name,
              status: "failed",
              exit_code: r.exitCode,
              duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
              stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR)
            });
            await log2.emit("engine.halted", {
              reason: "rate_limit_max_retries",
              retries: rateLimitRetries,
              step_index: i
            });
            await log2.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
            return { cycleId, artifactDir, status: "failed", failingStep: step.name };
          }
          const backoffMs = cfg2.engine.rate_limit_backoff_ms ?? 36e5;
          const retryAt = new Date(Date.now() + backoffMs).toISOString();
          await log2.emit("engine.paused", { reason: "rate_limit", retry_at: retryAt });
          await sleepFn(backoffMs);
          wasRateLimited = true;
          continue;
        }
        break;
      }
      if (wasRateLimited && r.status === "ok") {
        await log2.emit("engine.resumed", { reason: "rate_limit_cleared" });
      }
      if (r.timedOut) {
        await log2.emit("step.timeout", { cycle_id: cycleId, step: step.name, limit_ms: cfg2.engine.step_timeout_ms ?? null });
      }
      if (step.agent !== "bash") {
        if ((r.status === "ok" || r.timedOut) && step.name) {
          const sanitized = sanitizeArtifactStdout(r.stdout);
          const artifactPath = join23(artifactDir, `${step.name.toUpperCase()}.md`);
          await writeFile10(artifactPath, sanitized, "utf8");
          if (STEP_ARTIFACTS.has(step.name)) {
            const { proof } = STEP_ARTIFACTS.get(step.name);
            let proofError = null;
            if (proof === "spec-min-bytes") {
              const bytes = Buffer.byteLength(sanitized, "utf8");
              if (bytes < SPEC_MIN_BYTES) proofError = formatSpecGuardError(artifactPath, bytes, SPEC_MIN_BYTES);
            } else if (proof === "fix-conditional") {
              const mustFixPath = join23(artifactDir, "MUST-FIX.md");
              let mustFixContent = "";
              try {
                mustFixContent = await readFile14(mustFixPath, "utf8");
              } catch {
              }
              const taskCount = mustFixContent.split("\n").filter((l) => /^\s*[-*]\s*\[/.test(l)).length;
              if (taskCount >= 1 && sanitized.trim().length === 0) {
                proofError = formatFixGuardError(artifactPath, mustFixPath, taskCount);
              }
            } else {
              if (await classifyArtifact(artifactPath) === "empty") {
                proofError = r.timedOut ? formatTimeoutProofError(step.name, artifactPath, r.exitCode) : formatCompletionProofError(step.name, artifactPath);
              }
            }
            await log2.emit("step.completion_check", {
              cycle_id: cycleId,
              step: step.name,
              artifact: artifactPath,
              status: proofError ? "fail" : "pass"
            });
            if (proofError) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = proofError;
            } else if (r.timedOut) {
              r.status = "ok";
              await log2.emit("step.timeout_salvaged", { cycle_id: cycleId, step: step.name, artifact: artifactPath });
            }
          }
          if (r.status === "ok" && (step.name === "build" || step.name === "fix")) {
            const changed = spawnSync5("git", ["status", "--porcelain", "--", "src", "scripts", "tests"], {
              cwd: repoRoot,
              encoding: "utf8",
              shell: false
            });
            if (!changed.stdout || !changed.stdout.trim()) {
              let expectsCode = true;
              try {
                const issueBody = await readFile14(
                  join23(repoRoot, "docs/cycle/issues/todo", `${opts.issueId}.md`),
                  "utf8"
                );
                expectsCode = resolveExpectsCode(parseFrontmatter(issueBody).fm);
              } catch {
                expectsCode = true;
              }
              let docDeliverable = false;
              if (!expectsCode) {
                const docs = spawnSync5("git", ["status", "--porcelain", "--untracked-files=all", "--", "docs"], {
                  cwd: repoRoot,
                  encoding: "utf8",
                  shell: false
                });
                docDeliverable = docs.status === 0 && parseDocDeliverablePaths(docs.stdout ?? "").length > 0;
              }
              if (!expectsCode && docDeliverable) {
              } else {
                let marker = { valid: false };
                try {
                  marker = await classifyNoopMarker(join23(artifactDir, "NOOP.md"));
                } catch {
                  marker = { valid: false };
                }
                if (marker.valid) {
                  noopOutcome = { reason: marker.reason, step: step.name };
                } else {
                  r.status = "failed";
                  r.exitCode = r.exitCode || 1;
                  r.stderr = formatEmptyDiffGuardError(step.name);
                }
              }
            }
          }
          if (r.status === "ok" && step.name === "research") {
            let marker = { valid: false };
            try {
              marker = await classifyNoopMarker(join23(artifactDir, "NOOP.md"));
            } catch {
              marker = { valid: false };
            }
            if (marker.valid) {
              noopOutcome = { reason: marker.reason, step: step.name };
            }
          }
        }
        if (r.status === "ok" && step.name === "reflection") {
          await ingestReflection(
            repoRoot,
            cycleId,
            slug,
            r.stdout,
            log2,
            artifactDir,
            join23(artifactDir, "touched.json")
          );
        }
        if (r.status === "ok" && step.name === "documentation") {
          try {
            await appendDocumentationPaths(repoRoot, join23(artifactDir, "BUILD.md"), log2, cycleId, preSnapshot);
          } catch {
          }
        }
        if (r.status === "ok" && RESET_ELIGIBLE_STEPS.has(step.name)) {
          try {
            await accumulateTouchedFiles(repoRoot, artifactDir, preSnapshot);
          } catch {
          }
        }
      }
      let stdoutArtifact;
      const isFailedBash = step.agent === "bash" && r.status === "failed";
      if (isFailedBash) {
        const outPath = join23(artifactDir, `${step.name}.out`);
        const fullOutput = `=== stdout ===
${r.stdout}
=== stderr ===
${r.stderr}
`;
        try {
          await writeFile10(outPath, fullOutput, "utf8");
          stdoutArtifact = outPath;
        } catch (err) {
          await log2.emit("step.output_capture_failed", {
            cycle_id: cycleId,
            step: step.name,
            artifact: outPath,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
      await log2.emit("step.end", {
        cycle_id: cycleId,
        step: step.name,
        status: r.status,
        exit_code: r.exitCode,
        duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
        ...r.status === "failed" ? { stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR) } : {},
        ...isFailedBash ? { stdout: truncateHeadCapped(r.stdout, MAX_STEP_END_STDOUT) } : {},
        ...stdoutArtifact ? { stdout_artifact: stdoutArtifact } : {}
      });
      if (noopOutcome) {
        await log2.emit("cycle.noop", {
          cycle_id: cycleId,
          issue_id: opts.issueId,
          reason: noopOutcome.reason,
          detected_at_step: noopOutcome.step
        });
        await log2.emit("cycle.end", { cycle_id: cycleId, status: "noop" });
        return {
          cycleId,
          artifactDir,
          status: "noop",
          reason: noopOutcome.reason,
          detectedAtStep: noopOutcome.step
        };
      }
      if (r.status === "failed") {
        if (step.name === "reflection") {
          await log2.emit("reflection.skipped", { cycle_id: cycleId, reason: "exec_failed", exit_code: r.exitCode });
          continue;
        }
        if (step.name === "documentation") {
          await log2.emit("documentation.skipped", { cycle_id: cycleId, reason: "exec_failed", exit_code: r.exitCode });
          continue;
        }
        await log2.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
        return { cycleId, artifactDir, status: "failed", failingStep: step.name };
      }
    }
    await log2.emit("cycle.end", { cycle_id: cycleId, status: "ok" });
    return { cycleId, artifactDir, status: "ok" };
  } finally {
    const headBefore = await currentBranchName(repoRoot);
    let checkoutOk = false;
    if (cfg2.engine.commit.mode !== "worktree-pr") {
      await log2.emit("cycle.checkout", { cycle_id: cycleId, status: "skipped", base: cycleEnv.CYCLE_BASE, head_before: headBefore, reason: "trunk" });
      checkoutOk = true;
    } else {
      try {
        await checkoutBase(repoRoot, cycleEnv.CYCLE_BASE);
        checkoutOk = true;
        await log2.emit("cycle.checkout", { cycle_id: cycleId, status: "ok", base: cycleEnv.CYCLE_BASE, head_before: headBefore });
      } catch (err) {
        await log2.emit("cycle.checkout", { cycle_id: cycleId, status: "failed", base: cycleEnv.CYCLE_BASE, head_before: headBefore, reason: err.message });
      }
    }
    if (!checkoutOk) {
      await log2.emit("cycle.base_pull", { cycle_id: cycleId, status: "skipped", base: cycleEnv.CYCLE_BASE, reason: "checkout failed" });
    } else {
      try {
        const { shaBefore, shaAfter } = await pullBase(repoRoot, cycleEnv.CYCLE_BASE);
        await log2.emit("cycle.base_pull", { cycle_id: cycleId, status: "ok", base: cycleEnv.CYCLE_BASE, sha_before: shaBefore, sha_after: shaAfter });
      } catch (err) {
        await log2.emit("cycle.base_pull", { cycle_id: cycleId, status: "failed", base: cycleEnv.CYCLE_BASE, reason: err.message });
      }
    }
  }
}
var RESET_ELIGIBLE_STEPS, WALKTHROUGH_PHASES, SKIP_ELIGIBLE_STEPS, STEP_ARTIFACTS, ARTIFACT_STEPS, ARTIFACT_SUPPRESS_PROMPT, TOUCHED_RECOVERY_SOURCE, SPEC_MIN_BYTES, MAX_STEP_END_STDERR, MAX_STEP_END_STDOUT;
var init_run_cycle = __esm({
  "src/engine/run-cycle.ts"() {
    "use strict";
    init_cycle_id();
    init_workflow();
    init_log();
    init_exec_bash();
    init_exec();
    init_branch();
    init_reflection();
    init_sanitize_artifact();
    init_id();
    init_shell();
    init_log_fmt();
    init_compress_filter();
    init_path_utils();
    init_noop_marker();
    init_frontmatter();
    init_walkthrough();
    RESET_ELIGIBLE_STEPS = /* @__PURE__ */ new Set(["build", "fix", "final_fix", "quick_fix", "test_fix", "test_build"]);
    WALKTHROUGH_PHASES = /* @__PURE__ */ new Map([
      ["walkthrough_capture", void 0],
      ["walkthrough_before", "before"],
      ["walkthrough_after", "after"]
    ]);
    SKIP_ELIGIBLE_STEPS = /* @__PURE__ */ new Set(["spec", "research", "plan"]);
    STEP_ARTIFACTS = /* @__PURE__ */ new Map([
      ["spec", { artifact: "SPEC.md", proof: "spec-min-bytes" }],
      ["research", { artifact: "RESEARCH.md", proof: "nonempty" }],
      ["plan", { artifact: "PLAN.md", proof: "nonempty" }],
      ["build", { artifact: "BUILD.md", proof: "nonempty" }],
      ["review", { artifact: "REVIEW.md", proof: "nonempty" }],
      ["fix", { artifact: "FIX.md", proof: "fix-conditional" }],
      ["final_fix", { artifact: "FINAL_FIX.md", proof: "nonempty" }],
      ["documentation", { artifact: "DOCUMENTATION.md", proof: "nonempty" }],
      ["plan_documents", { artifact: "PLAN_DOCUMENTS.md", proof: "nonempty" }],
      ["authoring", { artifact: "AUTHORING.md", proof: "nonempty" }],
      ["review_documents", { artifact: "REVIEW_DOCUMENTS.md", proof: "nonempty" }]
    ]);
    ARTIFACT_STEPS = new Set(STEP_ARTIFACTS.keys());
    ARTIFACT_SUPPRESS_PROMPT = "You are in File Artifact Mode for this invocation. Output only the requested document content as clean structured Markdown. Do not include insight blocks, star-marker commentary, educational explanations, contribution requests, confirmation sentences, narration, or trailing commentary. Produce the file \u2014 nothing else.";
    TOUCHED_RECOVERY_SOURCE = "BUILD.md";
    SPEC_MIN_BYTES = 200;
    MAX_STEP_END_STDERR = 2e3;
    MAX_STEP_END_STDOUT = 2e3;
  }
});

// src/cli/run-one.ts
var run_one_exports = {};
__export(run_one_exports, {
  parseRunOneArgs: () => parseRunOneArgs,
  runOne: () => runOne
});
function parseRunOneArgs(argv2) {
  let cycleId;
  let issueId;
  let title;
  let workflow;
  let attempt;
  let skipCompletedOnRetry2 = false;
  let baseBranch;
  let resumeFromStep;
  for (let i = 0; i < argv2.length; i++) {
    const arg = argv2[i];
    switch (arg) {
      case "--cycle-id":
        cycleId = argv2[++i];
        break;
      case "--issue-id":
        issueId = argv2[++i];
        break;
      case "--title":
        title = argv2[++i];
        break;
      case "--workflow":
        workflow = argv2[++i];
        break;
      case "--attempt": {
        const n = Number(argv2[++i]);
        if (!Number.isInteger(n)) throw new Error("--attempt must be integer");
        attempt = n;
        break;
      }
      case "--skip-completed-on-retry":
        skipCompletedOnRetry2 = true;
        break;
      case "--base-branch":
        baseBranch = argv2[++i];
        break;
      case "--resume-from-step": {
        const n = Number(argv2[++i]);
        if (!Number.isInteger(n)) throw new Error("--resume-from-step must be integer");
        resumeFromStep = n;
        break;
      }
    }
  }
  if (!cycleId) throw new Error("--cycle-id is required");
  if (!issueId) throw new Error("--issue-id is required");
  if (title === void 0) throw new Error("--title is required");
  if (!workflow) throw new Error("--workflow is required");
  if (attempt === void 0) throw new Error("--attempt is required");
  return { cycleId, issueId, title, workflow, attempt, skipCompletedOnRetry: skipCompletedOnRetry2, baseBranch, resumeFromStep };
}
async function runOne(argv2, cwd2) {
  let params;
  try {
    params = parseRunOneArgs(argv2);
  } catch (e) {
    process.stderr.write(`run-one: bad args: ${e.message}
`);
    process.exit(2);
  }
  try {
    const result = await runCycle(cwd2, {
      cycleId: params.cycleId,
      issueId: params.issueId,
      title: params.title,
      workflow: params.workflow,
      attempt: params.attempt,
      skipCompletedOnRetry: params.skipCompletedOnRetry,
      baseBranch: params.baseBranch,
      ...params.resumeFromStep !== void 0 ? { resume: { startStepIndex: params.resumeFromStep } } : {}
    });
    process.exit(result.status === "ok" ? 0 : result.status === "noop" ? 3 : 1);
  } catch {
    process.exit(2);
  }
}
var init_run_one = __esm({
  "src/cli/run-one.ts"() {
    "use strict";
    init_run_cycle();
  }
});

// src/cli/cleanup.ts
var cleanup_exports = {};
__export(cleanup_exports, {
  runCliCleanup: () => runCliCleanup,
  runCliCleanupWithDeps: () => runCliCleanupWithDeps
});
import { readFile as readFile15 } from "node:fs/promises";
import { join as join24 } from "node:path";
async function resolveBranchName(root, rowId, rowTitle, readTodoFile) {
  for (const dir of ISSUE_DIRS) {
    const body = await readTodoFile(root, dir + "/" + rowId);
    if (body === null) continue;
    const { fm } = parseFrontmatter(body);
    if (typeof fm.workflow === "string" && fm.workflow.length > 0) {
      return "cycle/" + fm.workflow + "/" + slugify(rowTitle);
    }
  }
  return null;
}
async function runCliCleanupWithDeps(repoRoot, argv2, deps) {
  const isDryRun = !argv2.includes("--yes");
  const force = argv2.includes("--force");
  const unknownFlags = argv2.filter(
    (f) => f.startsWith("-") && !["--yes", "--dry-run", "--force"].includes(f)
  );
  if (unknownFlags.length > 0) {
    return { exitCode: 1, stdout: "", stderr: "Unknown flag(s): " + unknownFlags.join(", ") };
  }
  if (!force && await deps.isWorkingTreeDirty(repoRoot)) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Working tree is dirty. Commit or stash changes, or pass --force."
    };
  }
  const [branches, rows, head] = await Promise.all([
    deps.listCycleBranches(repoRoot),
    deps.readQueue(repoRoot),
    deps.currentBranchName(repoRoot)
  ]);
  const baseBranch = await deps.resolveBaseBranch(repoRoot);
  const liveNames = /* @__PURE__ */ new Set();
  for (const row of rows) {
    if (row.status !== "in_progress") continue;
    const name = await resolveBranchName(repoRoot, row.id, row.title, deps.readTodoFile);
    if (name !== null) liveNames.add(name);
  }
  const headIsOrphan = branches.some((b) => b.branch === head && !liveNames.has(b.branch));
  if (headIsOrphan) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "HEAD is an orphaned branch (" + head + "). Check out master before running cleanup."
    };
  }
  const orphans = branches.filter(
    (b) => !liveNames.has(b.branch) && b.branch !== head && b.branch !== baseBranch
  );
  if (isDryRun) {
    const payload2 = orphans.map((b) => ({
      branch: b.branch,
      head_sha: b.head_sha,
      last_commit_subject: b.last_commit_subject,
      in_progress_cycle_id: null
    }));
    return { exitCode: 0, stdout: JSON.stringify(payload2, null, 2), stderr: "" };
  }
  for (const b of orphans) {
    await deps.deleteBranch(repoRoot, b.branch);
    await deps.emitCleanupDeleted(b.branch, b.head_sha);
  }
  const payload = orphans.map((b) => ({
    branch: b.branch,
    head_sha: b.head_sha,
    deleted_at: (/* @__PURE__ */ new Date()).toISOString()
  }));
  return { exitCode: 0, stdout: JSON.stringify(payload, null, 2), stderr: "" };
}
async function runCliCleanup(repoRoot, argv2) {
  const log2 = await createLogger(repoRoot, () => {
  });
  let cfg2 = null;
  try {
    cfg2 = await loadConfig(repoRoot);
  } catch {
  }
  const deps = {
    listCycleBranches: (r) => listCycleBranches(r),
    currentBranchName: (r) => currentBranchName(r),
    isWorkingTreeDirty: (r) => isWorkingTreeDirty(r),
    deleteBranch: (r, b) => deleteBranch(r, b),
    readQueue,
    readTodoFile: async (root, relId) => {
      try {
        return await readFile15(join24(root, "docs/cycle/issues", relId + ".md"), "utf8");
      } catch {
        return null;
      }
    },
    emitCleanupDeleted: (name, was_head_sha) => log2.emit("branch.cleanup_deleted", { name, was_head_sha, deleted_at: (/* @__PURE__ */ new Date()).toISOString() }),
    resolveBaseBranch: async (root) => {
      if (cfg2?.engine?.base_branch) return cfg2.engine.base_branch;
      return "master";
    }
  };
  return runCliCleanupWithDeps(repoRoot, argv2, deps);
}
var ISSUE_DIRS;
var init_cleanup = __esm({
  "src/cli/cleanup.ts"() {
    "use strict";
    init_branch();
    init_queue();
    init_frontmatter();
    init_id();
    init_log();
    init_workflow();
    ISSUE_DIRS = ["todo", "done", "blocked", "failed"];
  }
});

// src/cli/compress-output.ts
var compress_output_exports = {};
__export(compress_output_exports, {
  runCompressOutput: () => runCompressOutput
});
import { spawnSync as spawnSync6 } from "node:child_process";
function parseNum(v) {
  if (v === void 0) return void 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : void 0;
}
function runCompressOutput(argv2, spawnFn = spawnSync6) {
  let thresholdBytes;
  let headLines;
  let tailLines;
  let i = 0;
  for (; i < argv2.length; i++) {
    const a = argv2[i];
    if (a === "--") {
      i++;
      break;
    }
    if (a === "--threshold-bytes") thresholdBytes = parseNum(argv2[++i]);
    else if (a === "--head-lines") headLines = parseNum(argv2[++i]);
    else if (a === "--tail-lines") tailLines = parseNum(argv2[++i]);
    else {
      return { stdout: "", stderr: USAGE, exitCode: 2 };
    }
  }
  const cmd = argv2.slice(i);
  if (cmd.length === 0) {
    return { stdout: "", stderr: USAGE, exitCode: 2 };
  }
  const [bin, ...rest] = cmd;
  const res = spawnFn(bin, rest, {
    shell: false,
    encoding: "utf8",
    env: buildChildEnv({}),
    maxBuffer: 64 * 1024 * 1024
  });
  if (res.error) {
    return { stdout: "", stderr: String(res.error.message) + "\n", exitCode: 127 };
  }
  const { text } = compressOutput(res.stdout ?? "", { thresholdBytes, headLines, tailLines });
  return { stdout: text, stderr: res.stderr ?? "", exitCode: res.status ?? 0 };
}
var USAGE;
var init_compress_output = __esm({
  "src/cli/compress-output.ts"() {
    "use strict";
    init_child_env();
    init_compress_filter();
    USAGE = "usage: cycle compress-output [--threshold-bytes N] [--head-lines N] [--tail-lines N] -- <cmd> [args...]\n";
  }
});

// src/cli/compress-output-hook.ts
var compress_output_hook_exports = {};
__export(compress_output_hook_exports, {
  runCompressOutputHook: () => runCompressOutputHook
});
function runCompressOutputHook(stdinJson, ctx) {
  try {
    const evt = JSON.parse(stdinJson);
    const command = evt?.tool_input?.command;
    if (typeof command !== "string")
      return {
        stdout: "",
        exitCode: 0,
        stderr: "cycle compress-output-hook: degraded (no rewrite) \u2014 PreToolUse event has no string tool_input.command (schema drift?); command passed through unchanged"
      };
    if (!classifyCommand(command).rewrite) return { stdout: "", exitCode: 0 };
    const updatedCommand = buildRewriteCommand({ ...ctx, command });
    return {
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          updatedInput: { command: updatedCommand }
        }
      }),
      exitCode: 0
    };
  } catch {
    return {
      stdout: "",
      exitCode: 0,
      stderr: "cycle compress-output-hook: degraded (no rewrite) \u2014 could not parse PreToolUse event; command passed through unchanged"
    };
  }
}
var init_compress_output_hook = __esm({
  "src/cli/compress-output-hook.ts"() {
    "use strict";
    init_compress_filter();
  }
});

// src/cli.ts
init_child_env();
import { appendFileSync } from "node:fs";
import { readFile as readFile16, readdir as readdir6, rename as rename7, mkdir as mkdir9 } from "node:fs/promises";
import { join as join25 } from "node:path";
import { spawn as spawn5 } from "node:child_process";

// src/version.ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname as dirname2, resolve } from "node:path";
async function getVersion() {
  if (true) return "0.2.0";
  const pkgPath = resolve(dirname2(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  return pkg.version;
}

// src/cli/parse-args.ts
import { parseArgs as nodeParseArgs } from "node:util";
function parseArgs(argv2) {
  if (argv2[0] === "drop") {
    let positionals2;
    try {
      ({ positionals: positionals2 } = nodeParseArgs({
        args: argv2.slice(1),
        options: {},
        allowPositionals: true
      }));
    } catch (err) {
      throw new Error(
        `drop: ${err.message} (usage: cycle drop "<text>")`
      );
    }
    const text2 = positionals2.join(" ").trim();
    if (!text2) throw new Error("drop requires task text");
    return { command: "drop", text: text2 };
  }
  if (argv2.length > 0 && argv2[0] !== "run") throw new Error(`unknown command: ${argv2[0]}`);
  const { values, positionals } = nodeParseArgs({
    args: argv2.slice(1),
    options: {
      workflow: { type: "string", default: "feature" },
      "dry-run": { type: "boolean", default: false },
      "no-skip-completed": { type: "boolean", default: false },
      trunk: { type: "boolean", default: false },
      "skip-preflight": { type: "boolean", default: false },
      help: { type: "boolean", default: false }
    },
    allowPositionals: true
  });
  const text = positionals.join(" ").trim();
  return {
    command: "run",
    text: text === "" ? null : text,
    workflow: String(values.workflow),
    dryRun: Boolean(values["dry-run"]),
    noSkipCompleted: Boolean(values["no-skip-completed"]),
    trunk: Boolean(values.trunk),
    skipPreflight: Boolean(values["skip-preflight"])
  };
}

// src/issue/materialize.ts
init_id();
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
async function materializeFreeformIssue(text, repoRoot, now = /* @__PURE__ */ new Date()) {
  const id = freeformId(text, now);
  const dir = join(repoRoot, "docs", "cycle", "issues", "inbox");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.md`);
  const frontmatter = [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${text.replace(/"/g, '\\"')}"`,
    `added_at: ${now.toISOString()}`,
    "triage_attempts: 0",
    "priority: medium",
    "---",
    "",
    text,
    ""
  ].join("\n");
  await writeFile(path, frontmatter, "utf8");
  return { path, id };
}

// src/cli.ts
init_triage();
init_log();
init_cycle_id();
init_queue();
init_workflow();

// src/engine/preflight.ts
init_child_env();
init_exec();
import { spawnSync } from "node:child_process";
import { readFileSync, statSync, accessSync, constants } from "node:fs";
import { join as join8 } from "node:path";
var AGENT_BINARY = {
  claudecode: { env: "CYCLE_CLAUDE_BIN", bin: "claude", install: "reinstall the Claude Code CLI natively for your platform" },
  codex: { env: "CYCLE_CODEX_BIN", bin: "codex", install: "npm i -g @openai/codex@latest" },
  gemini: { env: "CYCLE_GEMINI_BIN", bin: "gemini", install: "reinstall the Gemini CLI natively for your platform" },
  auggie: { env: "CYCLE_AUGGIE_BIN", bin: "auggie", install: "reinstall the Auggie CLI natively for your platform" },
  opencode: { env: "CYCLE_OPENCODE_BIN", bin: "opencode", install: "reinstall the opencode CLI natively for your platform" },
  pi: { env: "CYCLE_PI_BIN", bin: "pi", install: "reinstall the pi CLI natively for your platform" }
};
function readProcVersion() {
  try {
    return readFileSync("/proc/version", "utf8");
  } catch {
    return null;
  }
}
function isWsl(procVersion) {
  return !!procVersion && procVersion.toLowerCase().includes("microsoft");
}
function resolveOnPath(bin, pathEnv) {
  if (bin.includes("/")) return bin;
  for (const dir of pathEnv.split(":")) {
    if (!dir) continue;
    const candidate = join8(dir, bin);
    try {
      const st = statSync(candidate);
      if (!st.isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
    }
  }
  return null;
}
function findWorkflow(cfg2, workflowName) {
  return cfg2.workflows.find((w) => w.name === workflowName);
}
function distinctAgents(cfg2, workflowName) {
  const known = new Set(knownAgents());
  const set = /* @__PURE__ */ new Set();
  const wf = findWorkflow(cfg2, workflowName);
  if (wf) {
    for (const step of wf.steps) {
      if (step.agent !== "bash" && known.has(step.agent)) set.add(step.agent);
    }
  }
  const triageAgent = cfg2.triage?.agent;
  if (triageAgent && known.has(triageAgent)) set.add(triageAgent);
  return [...set];
}
function detectTools(cfg2, workflowName) {
  const set = /* @__PURE__ */ new Set(["bash", "git"]);
  const wf = findWorkflow(cfg2, workflowName);
  if (wf) {
    for (const step of wf.steps) {
      if (step.agent !== "bash") continue;
      const command = step.command?.trim();
      if (!command) continue;
      const head = command.split(/\s+/)[0];
      if (head && !head.includes("/")) set.add(head);
    }
  }
  return [...set];
}
function shadowWarning(target, resolvedPath) {
  return {
    kind: "wsl_shadow",
    target,
    resolvedPath,
    message: `${target} resolves under ${resolvedPath} (WSL /mnt/c) \u2014 this likely shadows a native Linux install; prefer a linux-x64 build or set CYCLE_<AGENT>_BIN.`
  };
}
function agentFix(agent, resolved, spec, shadowPrefix, probe) {
  if (resolved.startsWith(shadowPrefix)) {
    return `${agent} resolved to ${resolved} \u2014 a Windows build missing the linux-x64 binary. Install natively: ${spec.install}`;
  }
  return `${agent} resolved to ${resolved} \u2014 its \`--version\` probe failed (exit ${probe.status}). ${spec.install}`;
}
function runPreflight(opts) {
  try {
    const env = opts.env ?? process.env;
    const childPath = opts.pathEnv ?? buildChildEnv({}).PATH ?? "";
    const wsl = isWsl(opts.procVersion === void 0 ? readProcVersion() : opts.procVersion);
    const shadowPrefix = opts.shadowPrefix ?? "/mnt/c/";
    const checks = [];
    const failures = [];
    const warnings = [];
    for (const agent of distinctAgents(opts.cfg, opts.workflowName)) {
      const spec = AGENT_BINARY[agent];
      const override = env[spec.env];
      const resolved = override ?? resolveOnPath(spec.bin, childPath);
      if (!resolved) {
        failures.push({
          kind: "agent",
          name: agent,
          resolvedPath: null,
          fix: `${agent} binary "${spec.bin}" not found on PATH. Install it or set ${spec.env} to its path.`
        });
        checks.push({ kind: "agent", name: agent, resolvedPath: null, ok: false });
        continue;
      }
      const probe = spawnSync(resolved, ["--version"], { env: buildChildEnv({}), shell: false });
      const ok = !probe.error && probe.status === 0;
      checks.push({ kind: "agent", name: agent, resolvedPath: resolved, ok });
      if (!ok) {
        failures.push({
          kind: "agent",
          name: agent,
          resolvedPath: resolved,
          fix: agentFix(agent, resolved, spec, shadowPrefix, probe)
        });
      }
      if (wsl && resolved.startsWith(shadowPrefix)) warnings.push(shadowWarning(agent, resolved));
    }
    for (const tool of detectTools(opts.cfg, opts.workflowName)) {
      const resolved = resolveOnPath(tool, childPath);
      const ok = resolved !== null;
      checks.push({ kind: "tool", name: tool, resolvedPath: resolved, ok });
      if (!ok) {
        failures.push({
          kind: "tool",
          name: tool,
          resolvedPath: null,
          fix: `${tool} not found on PATH. Install ${tool} before running cycle (or use --skip-preflight).`
        });
      } else if (wsl && resolved.startsWith(shadowPrefix)) {
        warnings.push(shadowWarning(tool, resolved));
      }
    }
    return { ok: failures.length === 0, checks, failures, warnings };
  } catch (err) {
    return {
      ok: false,
      checks: [],
      warnings: [],
      failures: [
        { kind: "internal", name: "preflight", resolvedPath: null, fix: err.message }
      ]
    };
  }
}

// src/cli.ts
init_frontmatter();
init_log_tail();
init_branch();

// src/engine/commit-cycle.ts
init_child_env();
init_path_utils();
import { spawnSync as spawnSync2 } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile as readFile9 } from "node:fs/promises";
import { join as join11 } from "node:path";
var STATE_FILES = [".cycle/log.jsonl", ".cycle/tbd.jsonl"];
var defaultSpawn = (cmd, args2, opts) => {
  const r = spawnSync2(cmd, args2, {
    cwd: opts.cwd,
    shell: false,
    encoding: "utf8",
    env: opts.env
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};
function spawnGit(args2, cwd2, envExtra, spawn6) {
  const env = buildChildEnv(envExtra ?? {});
  const r = spawn6("git", args2, { cwd: cwd2, env });
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
async function stageFiles(repoRoot, envExtra, spawn6) {
  const env = buildChildEnv(envExtra ?? {});
  const lsStage = spawn6("git", ["ls-files", "--stage"], { cwd: repoRoot, env });
  const gitlinkPaths = /* @__PURE__ */ new Set();
  for (const line of (lsStage.stdout ?? "").split("\n")) {
    if (line.startsWith("160000 ")) {
      const parts = line.split("	");
      if (parts[1]) gitlinkPaths.add(parts[1].trim());
    }
  }
  const status = spawn6("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: repoRoot,
    env
  });
  for (const raw of (status.stdout ?? "").split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    if (isDenied(p) || gitlinkPaths.has(p.replace(/\/$/, ""))) continue;
    const full = join11(repoRoot, p);
    if (!existsSync(full)) {
      if (xy[0] === "D") continue;
      spawn6("git", ["add", "-u", "--", p], { cwd: repoRoot, env });
    } else {
      spawn6("git", ["add", "--", p], { cwd: repoRoot, env });
    }
  }
  for (const sf of STATE_FILES) {
    if (existsSync(join11(repoRoot, sf))) {
      spawn6("git", ["add", "--", sf], { cwd: repoRoot, env });
    }
  }
  const diff = spawnGit(["diff", "--cached", "--quiet"], repoRoot, envExtra, spawn6);
  return !diff.ok;
}
async function buildClosesBlock(issueId, repoRoot, envExtra, spawn6 = defaultSpawn) {
  if (!issueId) return "";
  const issuePath = join11(repoRoot, "docs/cycle/issues/todo", `${issueId}.md`);
  let body;
  try {
    body = await readFile9(issuePath, "utf8");
  } catch {
    return "";
  }
  const env = buildChildEnv(envExtra ?? {});
  const ghResult = spawn6(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    { cwd: repoRoot, env }
  );
  const repoSlug = (ghResult.stdout ?? "").trim();
  if (!repoSlug) return "";
  const urlRe = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)/g;
  const seen = /* @__PURE__ */ new Set();
  const lines = [];
  let m;
  while ((m = urlRe.exec(body)) !== null) {
    const [, owner, repo, num] = m;
    if (`${owner}/${repo}` === repoSlug && !seen.has(num)) {
      seen.add(num);
      lines.push(`Closes #${num}`);
    }
  }
  return lines.join("\n");
}
async function commitCycle(repoRoot, opts) {
  const { envExtra } = opts;
  const spawn6 = opts.spawnFn ?? defaultSpawn;
  let touchedFiles = /* @__PURE__ */ new Set();
  if (opts.artifactDir) {
    try {
      const raw = await readFile9(join11(opts.artifactDir, "touched.json"), "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.files)) touchedFiles = new Set(parsed.files);
    } catch {
    }
  }
  const statusOut = spawnGit(["status", "--porcelain"], repoRoot, envExtra, spawn6);
  const warnFiles = [];
  for (const raw of statusOut.stdout.split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy[0] === "D" || xy[1] === "D") continue;
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    if (isDenied(p)) continue;
    if (!p.startsWith("src/") && !p.startsWith("scripts/")) continue;
    if (!touchedFiles.has(p)) warnFiles.push(p);
  }
  if (warnFiles.length > 0) {
    await opts.log?.emit("commit.scope_warning", { cycle_id: opts.cycleId, files: warnFiles });
  }
  const hasChanges = await stageFiles(repoRoot, envExtra, spawn6);
  if (!hasChanges) return { status: "skipped", reason: "nothing_to_commit" };
  const closes = await buildClosesBlock(opts.issueId, repoRoot, envExtra, spawn6);
  const subject = `cycle ${opts.cycleId}: ${opts.title}`;
  const commitArgs = closes ? ["commit", "-m", subject, "-m", closes] : ["commit", "-m", subject];
  const commitResult = spawnGit(commitArgs, repoRoot, envExtra, spawn6);
  if (!commitResult.ok) return { status: "failed", reason: "commit_failed" };
  const shaResult = spawnGit(["rev-parse", "HEAD"], repoRoot, envExtra, spawn6);
  const sha = shaResult.stdout.trim();
  if (!opts.config.push || opts.config.mode === "local-only") return { status: "ok", sha };
  const BACKOFF_MS = [1e3, 2e3, 4e3];
  for (let attempt = 0; attempt < 3; attempt++) {
    const pushResult = spawnGit(["push", "origin", opts.baseBranch], repoRoot, envExtra, spawn6);
    if (pushResult.ok) return { status: "ok", sha };
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }
  return { status: "failed", reason: "push_failed", attempt: 3 };
}

// src/engine/issue-lifecycle.ts
init_frontmatter();
init_queue();
import { readFile as readFile10, rename as rename5, writeFile as writeFile5, unlink as unlink2 } from "node:fs/promises";
import { join as join13 } from "node:path";

// src/engine/blocked.ts
init_queue();
init_frontmatter();
import { rename as rename4 } from "node:fs/promises";
import { join as join12 } from "node:path";
async function propagateBlocked(repoRoot, failedId, log2, renameFn = rename4) {
  const todoDir2 = join12(repoRoot, "docs/cycle/issues/todo");
  const blockedDir = join12(repoRoot, "docs/cycle/issues/blocked");
  const rows = await readQueue(repoRoot);
  const visited = /* @__PURE__ */ new Set([failedId]);
  const orderedMoves = [];
  let frontier = /* @__PURE__ */ new Set([failedId]);
  while (frontier.size > 0) {
    const next = /* @__PURE__ */ new Set();
    for (const r of rows) {
      if (visited.has(r.id)) continue;
      const preds = r.depends_on.filter((d) => frontier.has(d));
      if (preds.length === 0) continue;
      orderedMoves.push({ row: r, predecessors: preds });
      visited.add(r.id);
      next.add(r.id);
    }
    frontier = next;
  }
  const blocked = [];
  const rollback = [];
  try {
    for (const { row, predecessors } of orderedMoves) {
      const src = join12(todoDir2, `${row.id}.md`);
      const dst = join12(blockedDir, `${row.id}.md`);
      await mutateFrontmatter(src, (fm) => ({
        ...fm,
        blocked_at: (/* @__PURE__ */ new Date()).toISOString(),
        blocked_by: predecessors
      }));
      await renameFn(src, dst);
      rollback.push(async () => {
        try {
          await renameFn(dst, src);
        } catch {
        }
      });
      blocked.push(row.id);
    }
    if (orderedMoves.length > 0) {
      const movedIds = new Set(orderedMoves.map((m) => m.row.id));
      await writeQueue(repoRoot, rows.filter((r) => !movedIds.has(r.id)));
    }
  } catch (err) {
    for (const undo of rollback.reverse()) await undo();
    throw err;
  }
  if (log2) {
    for (const m of orderedMoves) {
      await log2.emit("issue.blocked", { issue_id: m.row.id, blocked_by: m.predecessors });
    }
    await log2.emit("queue.propagate_blocked", { issue_id: failedId, blocked });
  }
  return { blocked };
}

// src/engine/issue-lifecycle.ts
async function terminalDrain(cwd2, log2, todoPath, failedDir2, cycleId, issueId, failingStep, failedAttempts) {
  let mutateErr = null;
  try {
    await mutateFrontmatter(todoPath, (fm) => ({
      ...fm,
      failed_at: (/* @__PURE__ */ new Date()).toISOString(),
      ...failingStep ? { failed_step: failingStep } : {},
      failed_attempts: failedAttempts,
      last_cycle_id: cycleId
    }));
  } catch (e) {
    mutateErr = e;
  }
  const failedPath = join13(failedDir2, `${issueId}.md`);
  if (mutateErr) {
    let originalBody = "";
    try {
      originalBody = await readFile10(todoPath, "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    let baseFm = {};
    let bodyAfter = originalBody;
    try {
      const parsed = parseFrontmatter(originalBody);
      baseFm = { ...parsed.fm };
      bodyAfter = parsed.bodyAfter;
    } catch {
    }
    const fm = {
      ...baseFm,
      failed_at: (/* @__PURE__ */ new Date()).toISOString(),
      ...failingStep ? { failed_step: failingStep } : {},
      failed_attempts: failedAttempts,
      last_cycle_id: cycleId,
      drain_error: mutateErr.message
    };
    const out = serializeFrontmatter(fm, bodyAfter);
    const tmpPath = `${failedPath}.tmp`;
    await writeFile5(tmpPath, out, "utf8");
    await rename5(tmpPath, failedPath);
    try {
      await unlink2(todoPath);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    await log2.emit("queue.drain_warning", {
      cycle_id: cycleId,
      issue_id: issueId,
      reason: `mutateFrontmatter failed: ${mutateErr.message}`
    });
  } else {
    try {
      await rename5(todoPath, failedPath);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  await drainFailedTerminal(cwd2, issueId);
  await propagateBlocked(cwd2, issueId, log2);
  await log2.emit("queue.drained", { cycle_id: cycleId, issue_id: issueId, outcome: "terminal" });
  await log2.emit("issue.failed", { issue_id: issueId, failing_step: failingStep });
}
async function noopDrain(cwd2, log2, todoPath, doneDir2, cycleId, issueId, reason, detectedAtStep) {
  let mutateErr = null;
  try {
    await mutateFrontmatter(todoPath, (fm) => ({
      ...fm,
      noop_at: (/* @__PURE__ */ new Date()).toISOString(),
      ...reason ? { noop_reason: reason } : {},
      ...detectedAtStep ? { noop_step: detectedAtStep } : {},
      last_cycle_id: cycleId
    }));
  } catch (e) {
    mutateErr = e;
  }
  const donePath = join13(doneDir2, `${issueId}.md`);
  if (mutateErr) {
    let originalBody = "";
    try {
      originalBody = await readFile10(todoPath, "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    let baseFm = {};
    let bodyAfter = originalBody;
    try {
      const parsed = parseFrontmatter(originalBody);
      baseFm = { ...parsed.fm };
      bodyAfter = parsed.bodyAfter;
    } catch {
    }
    const fm = {
      ...baseFm,
      noop_at: (/* @__PURE__ */ new Date()).toISOString(),
      ...reason ? { noop_reason: reason } : {},
      ...detectedAtStep ? { noop_step: detectedAtStep } : {},
      last_cycle_id: cycleId,
      drain_error: mutateErr.message
    };
    const out = serializeFrontmatter(fm, bodyAfter);
    const tmpPath = `${donePath}.tmp`;
    await writeFile5(tmpPath, out, "utf8");
    await rename5(tmpPath, donePath);
    try {
      await unlink2(todoPath);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    await log2.emit("queue.drain_warning", {
      cycle_id: cycleId,
      issue_id: issueId,
      reason: `mutateFrontmatter failed: ${mutateErr.message}`
    });
  } else {
    try {
      await rename5(todoPath, donePath);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  await drainOk(cwd2, issueId);
  await log2.emit("queue.drained", {
    cycle_id: cycleId,
    issue_id: issueId,
    outcome: "noop",
    ...reason ? { reason } : {}
  });
}

// src/engine/iteration-guard.ts
import { readFile as readFile11 } from "node:fs/promises";
import { join as join14 } from "node:path";
async function readCycleEndFailure(repoRoot, cycleId) {
  try {
    const text = await readFile11(join14(repoRoot, ".cycle", "log.jsonl"), "utf8");
    const lines = text.split("\n");
    let failingStep;
    let sawCycleEnd = false;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (!sawCycleEnd && ev.event === "cycle.end" && ev.cycle_id === cycleId && ev.status === "failed") {
        failingStep = typeof ev.failing_step === "string" ? ev.failing_step : void 0;
        sawCycleEnd = true;
        if (failingStep === void 0) break;
        continue;
      }
      if (sawCycleEnd && ev.event === "step.end" && ev.cycle_id === cycleId && ev.step === failingStep) {
        const d = ev.duration_ms;
        const durationMs = typeof d === "number" && Number.isFinite(d) ? d : void 0;
        return { failingStep, durationMs };
      }
    }
    return { failingStep, durationMs: void 0 };
  } catch {
    return { failingStep: void 0, durationMs: void 0 };
  }
}
async function readCycleNoop(repoRoot, cycleId) {
  try {
    const text = await readFile11(join14(repoRoot, ".cycle", "log.jsonl"), "utf8");
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.event === "cycle.noop" && ev.cycle_id === cycleId) {
        return {
          reason: typeof ev.reason === "string" ? ev.reason : void 0,
          detectedAtStep: typeof ev.detected_at_step === "string" ? ev.detected_at_step : void 0
        };
      }
    }
    return void 0;
  } catch {
    return void 0;
  }
}
function advanceFastFailCounter(prev, opts) {
  const subThreshold = opts.guardEnabled && opts.failingStep !== void 0 && typeof opts.durationMs === "number" && opts.durationMs < opts.thresholdMs;
  if (!subThreshold) {
    return { state: { key: null, count: 0 }, fastBail: false };
  }
  const count = opts.key === prev.key ? prev.count + 1 : 1;
  return { state: { key: opts.key, count }, fastBail: count >= opts.k };
}

// src/engine/halt-accounting.ts
function recordTerminalFailure(prev, opts) {
  const consecutiveFailures2 = prev.consecutiveFailures + 1;
  const failedCycles2 = [...prev.failedCycles, opts.cycleId];
  return {
    consecutiveFailures: consecutiveFailures2,
    failedCycles: failedCycles2,
    lastHaltContext: { issueId: opts.issueId, failingStep: opts.failingStep },
    fastFail: { key: null, count: 0 },
    halt: consecutiveFailures2 >= opts.maxConsecutiveFailures
  };
}

// src/engine/failed-residue-guard.ts
init_path_utils();
import { spawnSync as spawnSync3 } from "node:child_process";
function parseDirtyPaths(snapshot) {
  const paths = /* @__PURE__ */ new Set();
  for (const raw of snapshot.split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy === "??") {
      paths.add(raw.slice(3).replace(/^"/, "").replace(/"$/, ""));
      continue;
    }
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    paths.add(p.replace(/^"/, "").replace(/"$/, ""));
  }
  return [...paths];
}
function isEngineOwned(p) {
  const q2 = p.replace(/\/$/, "");
  if (isDenied(q2)) return true;
  if (q2 === ".cycle" || q2.startsWith(".cycle/")) return true;
  if (q2 === "docs/cycle" || q2.startsWith("docs/cycle/")) return true;
  return false;
}
function readFailedCycleResidue(cwd2) {
  const r = spawnSync3(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: cwd2, encoding: "utf8", shell: false }
  );
  if (r.status !== 0) {
    const detail = r.stderr || r.stdout || r.error?.message || `exit ${r.status}`;
    throw new Error(`git status --porcelain --untracked-files=all failed: ${detail}`);
  }
  const paths = parseDirtyPaths(r.stdout).filter((p) => !isEngineOwned(p));
  return { stdout: r.stdout, paths: [...new Set(paths)].sort() };
}
function formatFailedCycleResidueDiagnostic(ctx, dirtyPaths) {
  const cycleText = ctx?.cycleId ? ` from failed cycle ${ctx.cycleId}` : "";
  return [
    `Dirty worktree residue${cycleText} remains after terminal failure.`,
    "Resolve it before the engine starts or resumes another cycle:",
    "  - commit it, or",
    "  - stash it (git stash), or",
    "  - discard it (git reset --hard).",
    "Dirty paths:",
    ...dirtyPaths.map((p) => `- ${p}`)
  ].join("\n");
}

// src/engine/failed-cycle-teardown.ts
import { spawnSync as spawnSync4 } from "node:child_process";
import { rmSync } from "node:fs";
import { join as join15 } from "node:path";
function git2(cwd2, args2) {
  const r = spawnSync4("git", args2, { cwd: cwd2, encoding: "utf8", shell: false });
  if (r.status !== 0) {
    return { ok: false, detail: r.stderr || r.stdout || r.error?.message || `exit ${r.status}` };
  }
  return { ok: true, detail: r.stdout };
}
function categorize(snapshot) {
  const tracked = /* @__PURE__ */ new Set();
  const untracked = /* @__PURE__ */ new Set();
  for (const raw of snapshot.split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    const [p] = parseDirtyPaths(raw);
    if (p === void 0 || isEngineOwned(p)) continue;
    if (xy === "??") untracked.add(p);
    else tracked.add(p);
  }
  return { tracked: [...tracked], untracked: [...untracked] };
}
function teardownFailedCycle(cwd2, opts) {
  const reverted = [];
  let snapshot;
  try {
    snapshot = readFailedCycleResidue(cwd2).stdout;
  } catch (err) {
    return { ok: false, reverted, remaining: [], reason: err.message };
  }
  const { tracked, untracked } = categorize(snapshot);
  const all = [...tracked, ...untracked];
  if (all.length > 0) {
    const reset = git2(cwd2, ["reset", "-q", "HEAD", "--", ...all]);
    if (!reset.ok) {
      return { ok: false, reverted, remaining: all, reason: `git reset failed: ${reset.detail}` };
    }
  }
  let snap2;
  try {
    snap2 = readFailedCycleResidue(cwd2).stdout;
  } catch (err) {
    return { ok: false, reverted, remaining: all, reason: err.message };
  }
  const cat2 = categorize(snap2);
  if (cat2.tracked.length > 0) {
    const co = git2(cwd2, ["checkout", "--", ...cat2.tracked]);
    if (!co.ok) {
      return {
        ok: false,
        reverted,
        remaining: [...cat2.tracked, ...cat2.untracked],
        reason: `git checkout failed: ${co.detail}`
      };
    }
    reverted.push(...cat2.tracked);
  }
  for (const p of cat2.untracked) {
    try {
      rmSync(join15(cwd2, p), { recursive: true, force: true });
      reverted.push(p);
    } catch {
    }
  }
  if (opts.wipeDocs && opts.artifactDir) {
    try {
      rmSync(opts.artifactDir, { recursive: true, force: true });
      reverted.push(opts.artifactDir);
    } catch {
    }
  }
  let remaining;
  try {
    remaining = readFailedCycleResidue(cwd2).paths;
  } catch (err) {
    return { ok: false, reverted, remaining: [], reason: err.message };
  }
  return { ok: remaining.length === 0, reverted, remaining };
}

// src/engine/residue-context-store.ts
import { readFileSync as readFileSync2, writeFileSync, renameSync, unlinkSync } from "node:fs";
var defaultDeps = { readFileSync: readFileSync2, writeFileSync, renameSync, unlinkSync };
function writeResidueContext(path, ctx, deps = defaultDeps) {
  const body = JSON.stringify({
    cycleId: ctx.cycleId,
    issueId: ctx.issueId,
    failingStep: ctx.failingStep ?? null
  });
  const tmp = path + ".tmp";
  deps.writeFileSync(tmp, body, "utf8");
  deps.renameSync(tmp, path);
}
function readResidueContext(path, deps = defaultDeps) {
  let raw;
  try {
    raw = deps.readFileSync(path, "utf8");
  } catch (e) {
    const err = e;
    if (err.code === "ENOENT") return { status: "none" };
    return { status: "corrupt", error: err.message };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { status: "corrupt", error: e.message };
  }
  if (!isValidContext(parsed)) {
    return { status: "corrupt", error: "missing or invalid required fields" };
  }
  const o = parsed;
  return {
    status: "ok",
    ctx: { cycleId: o.cycleId, issueId: o.issueId, failingStep: o.failingStep ?? void 0 }
  };
}
function isValidContext(v) {
  if (typeof v !== "object" || v === null) return false;
  const o = v;
  return typeof o.cycleId === "string" && o.cycleId.length > 0 && typeof o.issueId === "string" && o.issueId.length > 0 && (o.failingStep === null || o.failingStep === void 0 || typeof o.failingStep === "string");
}
function deleteResidueContext(path, deps = defaultDeps) {
  try {
    deps.unlinkSync(path);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

// src/engine/stale-dist.ts
import { stat as stat2 } from "node:fs/promises";
import { join as join16 } from "node:path";
async function emitStaleDistWarning(log2, processStart2, cwd2, statFn = stat2) {
  const distPath = join16(cwd2, "dist", "cycle.js");
  let mtimeMs;
  try {
    const s = await statFn(distPath);
    mtimeMs = s.mtimeMs;
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  if (mtimeMs <= processStart2) return;
  await log2.emit("engine.warning", {
    reason: "stale_dist",
    dist_mtime: mtimeMs,
    process_start: processStart2,
    dist_path: distPath,
    message: `dist/cycle.js (${new Date(mtimeMs).toISOString()}) is newer than this process (${new Date(processStart2).toISOString()}); restart the engine to pick up the latest build`
  });
}

// src/engine/engine-lock.ts
import { readFileSync as readFileSync3, writeFileSync as writeFileSync2, unlinkSync as unlinkSync2 } from "node:fs";
var defaultDeps2 = {
  readFileSync: readFileSync3,
  writeFileSync: writeFileSync2,
  unlinkSync: unlinkSync2,
  kill: (pid, sig) => process.kill(pid, sig)
};
function acquireLock(lockPath2, deps = defaultDeps2) {
  try {
    const raw = deps.readFileSync(lockPath2, "utf8").trim();
    const pid = parseInt(raw, 10);
    if (!Number.isNaN(pid)) {
      try {
        deps.kill(pid, 0);
        throw new Error(`engine already running, pid ${pid}`);
      } catch (e) {
        const err = e;
        if (err.code === "ESRCH") {
        } else if (err.code === "EPERM") {
          throw new Error(`engine already running, pid ${pid}`);
        } else {
          throw e;
        }
      }
    }
  } catch (e) {
    const err = e;
    if (err.code !== "ENOENT") throw e;
  }
  deps.writeFileSync(lockPath2, String(process.pid), "utf8");
}
function releaseLock(lockPath2, deps = defaultDeps2) {
  try {
    const raw = deps.readFileSync(lockPath2, "utf8").trim();
    if (raw === String(process.pid)) {
      deps.unlinkSync(lockPath2);
    }
  } catch {
  }
}

// src/engine/dot-env.ts
import { readFileSync as readFileSync4 } from "node:fs";
var defaultReadFile = (filePath) => readFileSync4(filePath, "utf8");
function loadDotEnv(filePath, readFile17 = defaultReadFile) {
  let content;
  try {
    content = readFile17(filePath);
  } catch (e) {
    const err = e;
    if (err.code !== "ENOENT") {
      throw Object.assign(
        new Error(`Cannot read .env file at ${filePath}: ${err.message}`),
        { code: err.code }
      );
    }
    return;
  }
  for (const line of content.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (process.env[key] === void 0) {
      process.env[key] = value;
    }
  }
}

// src/cli.ts
init_id();
var processStart = Date.now();
var argv = process.argv.slice(2);
if (argv[0] === "--version") {
  console.log(await getVersion());
  process.exit(0);
}
if (argv[0] === "init") {
  const { runInit: runInit2 } = await Promise.resolve().then(() => (init_init(), init_exports));
  const force = argv.includes("--force");
  await runInit2({ targetRoot: process.cwd(), force });
  process.exit(0);
}
if (argv[0] === "upgrade") {
  const { runUpgrade: runUpgrade2 } = await Promise.resolve().then(() => (init_upgrade(), upgrade_exports));
  const result = await runUpgrade2({ targetRoot: process.cwd(), argv: argv.slice(1) });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr + String.fromCharCode(10));
  process.exit(result.exitCode);
}
if (argv[0] === "status") {
  const { runStatus: runStatus2 } = await Promise.resolve().then(() => (init_status(), status_exports));
  const out = await runStatus2({ cwd: process.cwd() });
  console.log(out);
  process.exit(0);
}
if (argv[0] === "triage") {
  const { runCliTriage: runCliTriage2 } = await Promise.resolve().then(() => (init_triage2(), triage_exports));
  const result = await runCliTriage2(process.cwd(), argv.slice(1));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr + "\n");
  process.exit(result.exitCode);
}
if (argv[0] === "run-one") {
  const { runOne: runOne2 } = await Promise.resolve().then(() => (init_run_one(), run_one_exports));
  await runOne2(argv.slice(1), process.cwd());
}
if (argv[0] === "cleanup") {
  const { runCliCleanup: runCliCleanup2 } = await Promise.resolve().then(() => (init_cleanup(), cleanup_exports));
  const result = await runCliCleanup2(process.cwd(), argv.slice(1));
  if (result.stdout) process.stdout.write(result.stdout + String.fromCharCode(10));
  if (result.stderr) process.stderr.write(result.stderr + String.fromCharCode(10));
  process.exit(result.exitCode);
}
if (argv[0] === "compress-output") {
  const { runCompressOutput: runCompressOutput2 } = await Promise.resolve().then(() => (init_compress_output(), compress_output_exports));
  const result = runCompressOutput2(argv.slice(1));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}
if (argv[0] === "compress-output-hook") {
  const { runCompressOutputHook: runCompressOutputHook2 } = await Promise.resolve().then(() => (init_compress_output_hook(), compress_output_hook_exports));
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const result = runCompressOutputHook2(Buffer.concat(chunks).toString("utf8"), {
    execPath: process.execPath,
    cliPath: process.argv[1]
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr + "\n");
  process.exit(result.exitCode);
}
if (argv[0] === "help" || argv[0] === "--help" || argv.includes("--help")) {
  console.log(`cycle \u2014 issue-driven workflow engine for autonomous code changes

Usage:
  cycle [run] [<task>] [flags]  Triage and run the queue (optionally add a freeform task first)
  cycle drop <task>             Add a freeform task to the inbox without running
  cycle status                  Print queue counts and in-flight state
  cycle triage [--dry-run]      Re-run triage diagnostics
  cycle cleanup [--dry-run] [--yes] [--force]
                                List or delete orphaned cycle/* branches
  cycle compress-output -- <cmd>   Run <cmd> and density-filter its stdout (token saver)
  cycle upgrade [--overwrite-prompts] [--overwrite-workflows]
                [--overwrite-scripts] [--overwrite-all]
                                Refresh engine bundle in place; preserve user config by default
  cycle help                    Show this help

Flags for run:
  --workflow <name>             Force a workflow (default: feature)
  --dry-run                     Preview triage/queue; no execution
  --no-skip-completed           Re-derive pre-build artifacts on retry
  --trunk                       Commit to base branch instead of per-cycle branches

  --version                     Print version and exit
  --help                        Show this help`);
  process.exit(0);
}
var args = parseArgs(argv);
var cwd = process.cwd();
if (args.command === "drop") {
  const { id, path } = await materializeFreeformIssue(args.text, cwd, /* @__PURE__ */ new Date());
  console.log(JSON.stringify({ event: "issue.dropped", issue_id: id, path }));
  process.exit(0);
}
if (args.text) {
  await materializeFreeformIssue(args.text, cwd);
}
if (args.dryRun) {
  const rows = await readQueue(cwd);
  for (const row of rows) {
    if (row.status !== "pending") continue;
    console.log(JSON.stringify({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      event: "issue.ingested",
      issue_id: row.id,
      path: join25(cwd, "docs/cycle/issues/todo", `${row.id}.md`)
    }));
  }
  console.log(JSON.stringify({
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    event: "engine.stop",
    status: "ok",
    dry_run: true,
    cycles_processed: 0
  }));
  process.exit(0);
}
var lockPath = join25(cwd, ".cycle", "engine.lock");
try {
  acquireLock(lockPath);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
process.on("exit", () => releaseLock(lockPath));
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));
var log = await createLogger(cwd);
var logPath = join25(cwd, ".cycle", "log.jsonl");
var activeCycleId;
process.prependListener("SIGTERM", () => {
  try {
    const line = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event: "cycle.killed", cycle_id: activeCycleId });
    appendFileSync(logPath, line + "\n", "utf8");
  } catch {
  }
  process.exit(143);
});
var todoDir = join25(cwd, "docs/cycle/issues/todo");
var doneDir = join25(cwd, "docs/cycle/issues/done");
var failedDir = join25(cwd, "docs/cycle/issues/failed");
var rawDir = join25(cwd, "docs/cycle/issues/inbox");
await mkdir9(doneDir, { recursive: true });
await mkdir9(failedDir, { recursive: true });
if (args.trunk) process.env.CYCLE_TRUNK_BASED = "1";
loadDotEnv(join25(cwd, ".cycle", ".env"));
var cfg = await loadConfig(cwd);
var skipCompletedOnRetry = args.noSkipCompleted ? false : cfg?.engine?.skip_completed_on_retry ?? true;
await emitStaleDistWarning(log, processStart, cwd);
await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry });
var residueContextPath = join25(cwd, ".cycle", "failed-residue-context.json");
var cyclesProcessed = 0;
var pendingResidueContext;
var engineStopEmitted = false;
async function persistResidue(ctx) {
  try {
    writeResidueContext(residueContextPath, ctx);
  } catch (err) {
    await log.emit("engine.warning", {
      reason: "residue_context_write_failed",
      cycle_id: ctx.cycleId,
      issue_id: ctx.issueId,
      error: err.message
    });
  }
}
async function unpersistResidue() {
  try {
    deleteResidueContext(residueContextPath);
  } catch (err) {
    await log.emit("engine.warning", {
      reason: "residue_context_delete_failed",
      error: err.message
    });
  }
}
if (cfg && !args.skipPreflight) {
  const pf = runPreflight({ cfg, workflowName: args.workflow });
  for (const w of pf.warnings) {
    await log.emit("engine.preflight.warning", {
      kind: w.kind,
      target: w.target,
      resolved_path: w.resolvedPath,
      message: w.message
    });
  }
  if (!pf.ok) {
    await log.emit("engine.preflight.failed", {
      failures: pf.failures.map((f) => ({
        kind: f.kind,
        name: f.name,
        resolved_path: f.resolvedPath,
        fix: f.fix
      }))
    });
    await log.emit("engine.stop", {
      status: "halted",
      dry_run: false,
      cycles_processed: 0,
      reason: "preflight_failed"
    });
    process.exit(1);
  }
  await log.emit("engine.preflight.ok", { checks: pf.checks.length });
}
{
  const persisted = readResidueContext(residueContextPath);
  if (persisted.status === "corrupt") {
    await log.emit("engine.warning", {
      reason: "residue_context_unreadable",
      error: persisted.error
    });
    await unpersistResidue();
  } else if (persisted.status === "ok") {
    pendingResidueContext = persisted.ctx;
    if (await haltIfResidue()) {
      process.exit(1);
    }
  }
}
if (cfg) {
  const triageResult = await runTriage(cwd, cfg, log);
  if (triageResult.status === "paused") {
    await log.emit("engine.stop", {
      status: "halted",
      dry_run: false,
      cycles_processed: 0,
      reason: "triage_failed"
    });
    process.exit(1);
  }
}
async function rawHasFiles() {
  try {
    const entries = await readdir6(rawDir);
    return entries.some((f) => f.endsWith(".md"));
  } catch {
    return false;
  }
}
var consecutiveFailures = 0;
var failedCycles = [];
var halted = false;
var haltReason = null;
var lastHaltContext;
var maxConsecutiveFailures = cfg?.engine?.max_consecutive_failures ?? 2;
var ITERATION_TOO_FAST_K = 2;
var fastFailKey = null;
var fastFailCount = 0;
async function drainSuccess(cwd2, log2, todoPath, doneDir2, cycleId, issueId) {
  await drainOk(cwd2, issueId);
  try {
    await rename7(todoPath, join25(doneDir2, `${issueId}.md`));
  } catch {
  }
  await log2.emit("queue.drained", { cycle_id: cycleId, issue_id: issueId, outcome: "ok" });
}
async function drainRetry(cwd2, log2, cycleId, issueId, failingStep) {
  await drainFailedRetry(cwd2, issueId);
  await log2.emit("queue.drained", { cycle_id: cycleId, issue_id: issueId, outcome: "retry" });
  await log2.emit("issue.failed", { issue_id: issueId, failing_step: failingStep });
}
function spawnRunOne(params) {
  const args2 = [
    "--cycle-id",
    params.cycleId,
    "--issue-id",
    params.issueId,
    "--title",
    params.title,
    "--workflow",
    params.workflow,
    "--attempt",
    String(params.attempt)
  ];
  if (params.skipCompletedOnRetry) args2.push("--skip-completed-on-retry");
  if (params.baseBranch !== void 0) args2.push("--base-branch", params.baseBranch);
  if (params.resumeFromStep !== void 0)
    args2.push("--resume-from-step", String(params.resumeFromStep));
  const extra = process.env.CYCLE_TRUNK_BASED === "1" ? { CYCLE_TRUNK_BASED: "1" } : {};
  return new Promise((resolve2, reject) => {
    const child = spawn5(
      process.execPath,
      [process.argv[1], "run-one", ...args2],
      { env: buildChildEnv(extra), stdio: "inherit", shell: false }
    );
    child.on("close", (code) => resolve2(code ?? 1));
    child.on("error", reject);
  });
}
async function runResumeOnce(cwd2, log2, cfg2, args2, tail, todoDir2, doneDir2, failedDir2) {
  let fmBaseBranch;
  try {
    const body = await readFile16(join25(todoDir2, `${tail.issueId}.md`), "utf8");
    const { fm } = parseFrontmatter(body);
    fmBaseBranch = typeof fm.base_branch === "string" && fm.base_branch.length > 0 ? fm.base_branch : void 0;
  } catch {
  }
  const base = process.env.CYCLE_BASE ?? resolveBaseBranch(cfg2.engine.base_branch, fmBaseBranch);
  let baseOk = true;
  try {
    await checkoutBase(cwd2, base);
    await pullBase(cwd2, base);
  } catch (err) {
    baseOk = false;
    await log2.emit("engine.warning", {
      reason: "resume_base_refresh_failed",
      message: err.message
    });
  }
  const rows = await readQueue(cwd2);
  const row = rows.find((r) => r.id === tail.issueId);
  const mismatch = !row || row.status !== "in_progress" || row.cycle_id !== void 0 && row.cycle_id !== tail.cycleId;
  if (mismatch) {
    await log2.emit("engine.warning", {
      reason: "resume_row_mismatch",
      cycle_id: tail.cycleId,
      issue_id: tail.issueId,
      row_status: row?.status ?? "missing",
      row_cycle_id: row?.cycle_id ?? null
    });
    return { processed: 0, outcome: "skipped" };
  }
  if (!baseOk) return { processed: 0, outcome: "skipped" };
  let workflowName = tail.workflow || args2.workflow;
  try {
    const body = await readFile16(join25(todoDir2, `${tail.issueId}.md`), "utf8");
    const { fm } = parseFrontmatter(body);
    if (typeof fm.workflow === "string" && fm.workflow.length > 0) {
      workflowName = fm.workflow;
    }
  } catch {
  }
  const wfDef = cfg2.workflows.find((w) => w.name === workflowName);
  if (!wfDef) {
    await log2.emit("engine.warning", {
      reason: "resume_workflow_missing",
      workflow: workflowName
    });
    return { processed: 0, outcome: "skipped" };
  }
  const stepNames = wfDef.steps.map((s) => s.name);
  let startStepIndex = stepNames.length;
  for (let i = 0; i < stepNames.length; i++) {
    if (!tail.completedSteps.includes(stepNames[i])) {
      startStepIndex = i;
      break;
    }
  }
  await markInProgress(cwd2, tail.issueId, tail.cycleId);
  await log2.emit("engine.resume", {
    cycle_id: tail.cycleId,
    issue_id: tail.issueId,
    from_step: stepNames[startStepIndex] ?? null,
    completed_steps: tail.completedSteps
  });
  const rawMax = wfDef.max_cycle_attempts ?? 3;
  const maxAttempts = rawMax < 1 ? 1 : rawMax;
  const exitCode = await spawnRunOne({
    cycleId: tail.cycleId,
    issueId: tail.issueId,
    title: tail.title,
    workflow: workflowName,
    attempt: row.attempt,
    skipCompletedOnRetry,
    resumeFromStep: startStepIndex
  });
  const failingStep = exitCode !== 0 && exitCode !== 3 ? (await readCycleEndFailure(cwd2, tail.cycleId)).failingStep : void 0;
  const todoPath = join25(todoDir2, `${tail.issueId}.md`);
  if (exitCode === 3) {
    const noop = await readCycleNoop(cwd2, tail.cycleId);
    if (!noop || noop.reason === void 0) {
      await log2.emit("engine.warning", { reason: "noop_reason_unreadable", cycle_id: tail.cycleId, issue_id: tail.issueId });
    }
    await noopDrain(cwd2, log2, todoPath, doneDir2, tail.cycleId, tail.issueId, noop?.reason, noop?.detectedAtStep);
    return { processed: 1, outcome: "noop" };
  }
  if (exitCode === 0) {
    const artifactDir2 = join25(cwd2, "docs", "cycle", `${tail.cycleId}-${workflowName}-${slugify(tail.title)}`);
    const cr = await commitCycle(cwd2, {
      cycleId: tail.cycleId,
      title: tail.title,
      issueId: tail.issueId,
      config: cfg2.engine.commit,
      baseBranch: cfg2.engine.base_branch,
      log: log2,
      artifactDir: artifactDir2
    });
    if (cr.status === "failed") {
      if (row.attempt + 1 < maxAttempts) {
        await drainRetry(cwd2, log2, tail.cycleId, tail.issueId, "commit");
        return { processed: 0, outcome: "retry", issueId: tail.issueId, failingStep: "commit" };
      }
      await terminalDrain(cwd2, log2, todoPath, failedDir2, tail.cycleId, tail.issueId, "commit", row.attempt + 1);
      return { processed: 0, outcome: "terminal", issueId: tail.issueId, failingStep: "commit" };
    }
    await drainSuccess(cwd2, log2, todoPath, doneDir2, tail.cycleId, tail.issueId);
    return { processed: 1, outcome: "ok" };
  }
  const artifactDir = join25(cwd2, "docs", "cycle", `${tail.cycleId}-${workflowName}-${slugify(tail.title)}`);
  if (row.attempt + 1 < maxAttempts) {
    const td2 = teardownFailedCycle(cwd2, { artifactDir, wipeDocs: true });
    await drainRetry(cwd2, log2, tail.cycleId, tail.issueId, failingStep);
    if (td2.ok) {
      await log2.emit("cycle.restart", {
        cycle_id: tail.cycleId,
        issue_id: tail.issueId,
        attempt: row.attempt + 1,
        failing_step: failingStep,
        reverted: td2.reverted.length
      });
    } else {
      await log2.emit("engine.warning", {
        reason: "failed_cycle_teardown_incomplete",
        cycle_id: tail.cycleId,
        issue_id: tail.issueId,
        remaining: td2.remaining,
        ...td2.reason ? { detail: td2.reason } : {}
      });
    }
    return { processed: 0, outcome: "retry", issueId: tail.issueId, failingStep, teardownOk: td2.ok };
  }
  const td = teardownFailedCycle(cwd2, { artifactDir, wipeDocs: false });
  await terminalDrain(cwd2, log2, todoPath, failedDir2, tail.cycleId, tail.issueId, failingStep, row.attempt + 1);
  return { processed: 0, outcome: "terminal", issueId: tail.issueId, failingStep, teardownOk: td.ok };
}
async function haltIfResidue() {
  if (!pendingResidueContext) return false;
  const ctx = pendingResidueContext;
  let dirtyPaths;
  let message;
  try {
    dirtyPaths = readFailedCycleResidue(cwd).paths;
  } catch (err) {
    dirtyPaths = [];
    message = `Residue check failed after cycle ${ctx.cycleId}: ${err.message}`;
    await emitResidueHalt(ctx, dirtyPaths, message);
    return true;
  }
  if (dirtyPaths.length === 0) {
    pendingResidueContext = void 0;
    await unpersistResidue();
    return false;
  }
  message = formatFailedCycleResidueDiagnostic(ctx, dirtyPaths);
  await emitResidueHalt(ctx, dirtyPaths, message);
  return true;
}
async function emitResidueHalt(ctx, dirtyPaths, message) {
  await log.emit("engine.halted", {
    reason: "failed_cycle_dirty_worktree",
    failed_cycle_id: ctx.cycleId,
    issue_id: ctx.issueId,
    dirty_paths: dirtyPaths,
    message
  });
  await log.emit("engine.stop", {
    status: "halted",
    dry_run: false,
    cycles_processed: cyclesProcessed,
    reason: "failed_cycle_dirty_worktree",
    halted_at_issue: ctx.issueId,
    failing_step: ctx.failingStep
  });
  engineStopEmitted = true;
  process.stderr.write(message + "\n");
}
if (cfg) {
  const tail = await readLogTail(cwd);
  if (tail) {
    activeCycleId = tail.cycleId;
    pendingResidueContext = { cycleId: tail.cycleId, issueId: tail.issueId, failingStep: void 0 };
    if (await haltIfResidue()) {
      halted = true;
      haltReason = "failed_cycle_dirty_worktree";
    } else {
      const result = await runResumeOnce(cwd, log, cfg, args, tail, todoDir, doneDir, failedDir);
      cyclesProcessed += result.processed;
      if (result.outcome === "ok") {
        consecutiveFailures = 0;
        failedCycles = [];
        lastHaltContext = void 0;
        pendingResidueContext = void 0;
        await unpersistResidue();
      } else if (result.outcome === "terminal") {
        consecutiveFailures += 1;
        failedCycles.push(tail.cycleId);
        lastHaltContext = { issueId: result.issueId, failingStep: result.failingStep };
        if (result.teardownOk) {
          pendingResidueContext = void 0;
          await unpersistResidue();
        } else {
          pendingResidueContext = { cycleId: tail.cycleId, issueId: result.issueId, failingStep: result.failingStep };
          await persistResidue(pendingResidueContext);
        }
        if (consecutiveFailures >= maxConsecutiveFailures) {
          halted = true;
          haltReason = "max_consecutive_failures";
        }
      } else if (result.outcome === "noop") {
        pendingResidueContext = void 0;
        await unpersistResidue();
      } else if (result.outcome === "retry" && result.teardownOk === false) {
        pendingResidueContext = { cycleId: tail.cycleId, issueId: result.issueId, failingStep: result.failingStep };
        await persistResidue(pendingResidueContext);
      } else {
        pendingResidueContext = void 0;
        await unpersistResidue();
      }
    }
    activeCycleId = void 0;
  }
}
while (!halted) {
  if (await haltIfResidue()) {
    halted = true;
    haltReason = "failed_cycle_dirty_worktree";
    break;
  }
  if (cfg && await rawHasFiles()) {
    const r = await runTriage(cwd, cfg, log);
    if (r.status === "paused") {
      halted = true;
      haltReason = "triage_failed";
      lastHaltContext = { issueId: "", failingStep: "triage" };
      break;
    }
  }
  const row = await popNextPending(cwd);
  if (!row) break;
  const todoPath = join25(todoDir, `${row.id}.md`);
  const cycleId = row.cycle_id ?? await allocateCycleId(cwd);
  activeCycleId = cycleId;
  await log.emit("issue.ingested", { issue_id: row.id, path: todoPath });
  let workflowName = args.workflow;
  let fmBaseBranch;
  try {
    const body = await readFile16(todoPath, "utf8");
    const { fm } = parseFrontmatter(body);
    if (typeof fm.workflow === "string" && fm.workflow.length > 0) {
      workflowName = fm.workflow;
    }
    if (typeof fm.base_branch === "string" && fm.base_branch.length > 0) {
      fmBaseBranch = fm.base_branch;
    }
  } catch {
  }
  const wfCfg = cfg?.workflows.find((w) => w.name === workflowName);
  const rawMax = wfCfg?.max_cycle_attempts ?? 3;
  const maxAttempts = rawMax < 1 ? 1 : rawMax;
  await markInProgress(cwd, row.id, cycleId);
  const exitCode = await spawnRunOne({
    cycleId,
    issueId: row.id,
    title: row.title,
    workflow: workflowName,
    attempt: row.attempt,
    skipCompletedOnRetry,
    baseBranch: fmBaseBranch
  });
  const failure = exitCode !== 0 && exitCode !== 3 ? await readCycleEndFailure(cwd, cycleId) : { failingStep: void 0, durationMs: void 0 };
  const failingStep = failure.failingStep;
  const rawMin = cfg?.engine?.min_step_duration_ms;
  const thresholdMs = typeof rawMin === "number" && Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0;
  const guardEnabled = thresholdMs > 0;
  const artifactDir = join25(cwd, "docs", "cycle", `${cycleId}-${workflowName}-${slugify(row.title)}`);
  if (exitCode === 3) {
    const noop = await readCycleNoop(cwd, cycleId);
    if (!noop || noop.reason === void 0) {
      await log.emit("engine.warning", { reason: "noop_reason_unreadable", cycle_id: cycleId, issue_id: row.id });
    }
    await noopDrain(cwd, log, todoPath, doneDir, cycleId, row.id, noop?.reason, noop?.detectedAtStep);
    cyclesProcessed++;
    pendingResidueContext = void 0;
    await unpersistResidue();
  } else if (exitCode === 0) {
    const cr = await commitCycle(cwd, {
      cycleId,
      title: row.title,
      issueId: row.id,
      config: cfg.engine.commit,
      baseBranch: cfg.engine.base_branch,
      log,
      artifactDir
    });
    if (cr.status === "failed") {
      if (row.attempt + 1 < maxAttempts) {
        await drainRetry(cwd, log, cycleId, row.id, "commit");
      } else {
        await terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, "commit", row.attempt + 1);
        const acct = recordTerminalFailure(
          { consecutiveFailures, failedCycles },
          { cycleId, issueId: row.id, failingStep: "commit", maxConsecutiveFailures }
        );
        consecutiveFailures = acct.consecutiveFailures;
        failedCycles = acct.failedCycles;
        lastHaltContext = acct.lastHaltContext;
        fastFailKey = acct.fastFail.key;
        fastFailCount = acct.fastFail.count;
        pendingResidueContext = { cycleId, issueId: row.id, failingStep: "commit" };
        await persistResidue(pendingResidueContext);
        if (acct.halt) {
          halted = true;
          haltReason = "max_consecutive_failures";
          activeCycleId = void 0;
          break;
        }
      }
    } else {
      await drainSuccess(cwd, log, todoPath, doneDir, cycleId, row.id);
      cyclesProcessed++;
      consecutiveFailures = 0;
      failedCycles = [];
      lastHaltContext = void 0;
      fastFailKey = null;
      fastFailCount = 0;
      pendingResidueContext = void 0;
      await unpersistResidue();
    }
  } else {
    const key = `${cycleId}::${failingStep ?? ""}`;
    const advanced = advanceFastFailCounter(
      { key: fastFailKey, count: fastFailCount },
      {
        key,
        guardEnabled,
        failingStep,
        durationMs: failure.durationMs,
        thresholdMs,
        k: ITERATION_TOO_FAST_K
      }
    );
    fastFailKey = advanced.state.key;
    fastFailCount = advanced.state.count;
    const fastBail = advanced.fastBail;
    const attemptsLeft = row.attempt + 1 < maxAttempts;
    if (!fastBail && attemptsLeft) {
      const td = teardownFailedCycle(cwd, { artifactDir, wipeDocs: true });
      if (td.ok) {
        await drainRetry(cwd, log, cycleId, row.id, failingStep);
        await log.emit("cycle.restart", {
          cycle_id: cycleId,
          issue_id: row.id,
          attempt: row.attempt + 1,
          failing_step: failingStep,
          reverted: td.reverted.length
        });
        pendingResidueContext = void 0;
        await unpersistResidue();
      } else {
        await log.emit("engine.warning", {
          reason: "failed_cycle_teardown_incomplete",
          cycle_id: cycleId,
          issue_id: row.id,
          remaining: td.remaining,
          ...td.reason ? { detail: td.reason } : {}
        });
        pendingResidueContext = { cycleId, issueId: row.id, failingStep };
        await persistResidue(pendingResidueContext);
      }
    } else {
      if (fastBail) {
        await log.emit("step.warning", {
          cycle_id: cycleId,
          step: failingStep,
          reason: "iteration_too_fast",
          duration_ms: failure.durationMs,
          threshold_ms: thresholdMs
        });
      }
      const td = teardownFailedCycle(cwd, { artifactDir, wipeDocs: false });
      await terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, failingStep, row.attempt + 1);
      const acct = recordTerminalFailure(
        { consecutiveFailures, failedCycles },
        { cycleId, issueId: row.id, failingStep, maxConsecutiveFailures }
      );
      consecutiveFailures = acct.consecutiveFailures;
      failedCycles = acct.failedCycles;
      lastHaltContext = acct.lastHaltContext;
      fastFailKey = acct.fastFail.key;
      fastFailCount = acct.fastFail.count;
      if (td.ok) {
        pendingResidueContext = void 0;
        await unpersistResidue();
      } else {
        pendingResidueContext = { cycleId, issueId: row.id, failingStep };
        await persistResidue(pendingResidueContext);
      }
      if (acct.halt) {
        halted = true;
        haltReason = "max_consecutive_failures";
        activeCycleId = void 0;
        break;
      }
    }
  }
  activeCycleId = void 0;
}
if (halted && haltReason === "max_consecutive_failures" && failedCycles.length > 0) {
  await log.emit("engine.halted", {
    failed_cycles: failedCycles,
    reason: "max_consecutive_failures",
    threshold: maxConsecutiveFailures
  });
}
if (!engineStopEmitted) {
  await log.emit("engine.stop", {
    status: halted ? "halted" : "ok",
    dry_run: false,
    cycles_processed: cyclesProcessed,
    ...halted && haltReason === "triage_failed" ? { reason: "triage_failed" } : {},
    ...halted && lastHaltContext ? { halted_at_issue: lastHaltContext.issueId, failing_step: lastHaltContext.failingStep } : {}
  });
}
process.exit(halted ? 1 : 0);
