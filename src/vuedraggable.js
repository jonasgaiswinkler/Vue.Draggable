import Sortable, { MultiDrag } from "sortablejs";
import { insertNodeAt, camelize, console, removeNode } from "./util/helper";

function createSortableInstance(rootContainer, options) {
  const sortable = new Sortable(rootContainer, options);
  // check multidrag plugin loaded
  // - cjs ("sortable.js") and complete esm ("sortable.complete.esm") mount MultiDrag automatically.
  // - default esm ("sortable.esm") does not mount MultiDrag automatically.
  if (options.multiDrag && !sortable.multiDrag) {
    // mount plugin if not mounted
    Sortable.mount(new MultiDrag());
    // destroy and recreate sortable.js instance
    sortable.destroy();
    return createSortableInstance(rootContainer, options);
  } else {
    return sortable;
  }
}

function buildAttribute(object, propName, value) {
  if (value === undefined) {
    return object;
  }
  object = object || {};
  object[propName] = value;
  return object;
}

function computeVmIndex(vnodes, element) {
  return vnodes.map(elt => elt.elm).indexOf(element);
}

function computeIndexes(slots, children, isTransition, footerOffset) {
  if (!slots) {
    return [];
  }

  const elmFromNodes = slots.map(elt => elt.elm);
  const footerIndex = children.length - footerOffset;
  const rawIndexes = [...children].map((elt, idx) =>
    idx >= footerIndex ? elmFromNodes.length : elmFromNodes.indexOf(elt)
  );
  return isTransition ? rawIndexes.filter(ind => ind !== -1) : rawIndexes;
}

function emit(evtName, evtData) {
  this.$nextTick(() => this.$emit(evtName.toLowerCase(), evtData));
}

function delegateAndEmit(evtName) {
  return evtData => {
    if (this.realList !== null) {
      this["onDrag" + evtName](evtData);
    }
    emit.call(this, evtName, evtData);
  };
}

function isTransitionName(name) {
  return ["transition-group", "TransitionGroup"].includes(name);
}

function isTransition(slots) {
  if (!slots || slots.length !== 1) {
    return false;
  }
  const [{ componentOptions }] = slots;
  if (!componentOptions) {
    return false;
  }
  return isTransitionName(componentOptions.tag);
}

function getSlot(slot, scopedSlot, key) {
  return slot[key] || (scopedSlot[key] ? scopedSlot[key]() : undefined);
}

function computeChildrenAndOffsets(children, slot, scopedSlot) {
  let headerOffset = 0;
  let footerOffset = 0;
  const header = getSlot(slot, scopedSlot, "header");
  if (header) {
    headerOffset = header.length;
    children = children ? [...header, ...children] : [...header];
  }
  const footer = getSlot(slot, scopedSlot, "footer");
  if (footer) {
    footerOffset = footer.length;
    children = children ? [...children, ...footer] : [...footer];
  }
  return { children, headerOffset, footerOffset };
}

function getComponentAttributes($attrs, componentData) {
  let attributes = null;
  const update = (name, value) => {
    attributes = buildAttribute(attributes, name, value);
  };
  const attrs = Object.keys($attrs)
    .filter(key => key === "id" || key.startsWith("data-"))
    .reduce((res, key) => {
      res[key] = $attrs[key];
      return res;
    }, {});
  update("attrs", attrs);

  if (!componentData) {
    return attributes;
  }
  const { on, props, attrs: componentDataAttrs } = componentData;
  update("on", on);
  update("props", props);
  Object.assign(attributes.attrs, componentDataAttrs);
  return attributes;
}

function getIndiciesToRemove(items, offset) {
  return Array.from(items)
    .reverse()
    .map(({ index }) => index - offset);
}

const eventsListened = ["Start", "Add", "Remove", "Update", "End"];
const eventsToEmit = [
  "Choose",
  "Unchoose",
  "Sort",
  "Filter",
  "Clone",
  "Select",
  "Deselect"
];
const readonlyProperties = ["Move", ...eventsListened, ...eventsToEmit].map(
  evt => "on" + evt
);
var draggingElement = null;

const props = {
  options: Object,
  list: {
    type: Array,
    required: false,
    default: null
  },
  value: {
    type: Array,
    required: false,
    default: null
  },
  noTransitionOnDrag: {
    type: Boolean,
    default: false
  },
  clone: {
    type: Function,
    default: original => {
      return original;
    }
  },
  element: {
    type: String,
    default: "div"
  },
  tag: {
    type: String,
    default: null
  },
  move: {
    type: Function,
    default: null
  },
  componentData: {
    type: Object,
    required: false,
    default: null
  },
  // plugin: multidrag
  multiDrag: {
    type: Boolean,
    required: false,
    default: false
  },
  multiDragKey: {
    type: String,
    required: false,
    default: null
  },
  selectedClass: {
    type: String,
    required: false,
    default: null
  }
};

const draggableComponent = {
  name: "draggable",

  inheritAttrs: false,

  props,

  data() {
    return {
      transitionMode: false,
      noneFunctionalComponentMode: false
    };
  },

  render(h) {
    const slots = this.$slots.default;
    this.transitionMode = isTransition(slots);
    const { children, headerOffset, footerOffset } = computeChildrenAndOffsets(
      slots,
      this.$slots,
      this.$scopedSlots
    );
    this.headerOffset = headerOffset;
    this.footerOffset = footerOffset;
    const attributes = getComponentAttributes(this.$attrs, this.componentData);
    return h(this.getTag(), attributes, children);
  },

  created() {
    if (this.list !== null && this.value !== null) {
      console.error(
        "Value and list props are mutually exclusive! Please set one or another."
      );
    }

    if (this.element !== "div") {
      console.warn(
        "Element props is deprecated please use tag props instead. See https://github.com/SortableJS/Vue.Draggable/blob/master/documentation/migrate.md#element-props"
      );
    }

    if (this.options !== undefined) {
      console.warn(
        "Options props is deprecated, add sortable options directly as vue.draggable item, or use v-bind. See https://github.com/SortableJS/Vue.Draggable/blob/master/documentation/migrate.md#options-props"
      );
    }
  },

  mounted() {
    this.noneFunctionalComponentMode =
      this.getTag().toLowerCase() !== this.$el.nodeName.toLowerCase() &&
      !this.getIsFunctional();
    if (this.noneFunctionalComponentMode && this.transitionMode) {
      throw new Error(
        `Transition-group inside component is not supported. Please alter tag value or remove transition-group. Current tag value: ${this.getTag()}`
      );
    }
    const optionsAdded = {};
    eventsListened.forEach(elt => {
      optionsAdded["on" + elt] = delegateAndEmit.call(this, elt);
    });

    eventsToEmit.forEach(elt => {
      optionsAdded["on" + elt] = emit.bind(this, elt);
    });

    const attributes = Object.keys(this.$attrs).reduce((res, key) => {
      res[camelize(key)] = this.$attrs[key];
      return res;
    }, {});

    if (this.multiDrag) {
      optionsAdded.multiDrag = this.multiDrag;
      ["selectedClass", "multiDragKey"]
        .filter(key => this[key])
        .forEach(key => (optionsAdded[key] = this[key]));
    }

    const options = Object.assign({}, this.options, attributes, optionsAdded, {
      onMove: (evt, originalEvent) => {
        return this.onDragMove(evt, originalEvent);
      }
    });
    !("draggable" in options) && (options.draggable = ">*");

    this._sortable = createSortableInstance(this.rootContainer, options);
    this.computeIndexes();
  },

  beforeDestroy() {
    if (this._sortable !== undefined) this._sortable.destroy();
  },

  computed: {
    rootContainer() {
      return this.transitionMode ? this.$el.children[0] : this.$el;
    },

    realList() {
      return this.list ? this.list : this.value;
    }
  },

  watch: {
    options: {
      handler(newOptionValue) {
        this.updateOptions(newOptionValue);
      },
      deep: true
    },

    $attrs: {
      handler(newOptionValue) {
        this.updateOptions(newOptionValue);
      },
      deep: true
    },

    realList() {
      this.computeIndexes();
    }
  },

  methods: {
    getIsFunctional() {
      const { fnOptions } = this._vnode;
      return fnOptions && fnOptions.functional;
    },

    getTag() {
      return this.tag || this.element;
    },

    updateOptions(newOptionValue) {
      for (var property in newOptionValue) {
        const value = camelize(property);
        if (readonlyProperties.indexOf(value) === -1) {
          this._sortable.option(value, newOptionValue[property]);
        }
      }
    },

    getChildrenNodes() {
      if (this.noneFunctionalComponentMode) {
        return this.$children[0].$slots.default;
      }
      const rawNodes = this.$slots.default;
      return this.transitionMode ? rawNodes[0].child.$slots.default : rawNodes;
    },

    computeIndexes() {
      this.$nextTick(() => {
        this.visibleIndexes = computeIndexes(
          this.getChildrenNodes(),
          this.rootContainer.children,
          this.transitionMode,
          this.footerOffset
        );
      });
    },

    getUnderlyingVm(htmlElt) {
      const index = computeVmIndex(this.getChildrenNodes() || [], htmlElt);
      if (index === -1) {
        //Edge case during move callback: related element might be
        //an element different from collection
        return null;
      }
      const element = this.realList[index];
      return { index, element };
    },

    getUnderlyingPotencialDraggableComponent({ __vue__: vue }) {
      if (
        !vue ||
        !vue.$options ||
        !isTransitionName(vue.$options._componentTag)
      ) {
        if (
          !("realList" in vue) &&
          vue.$children.length === 1 &&
          "realList" in vue.$children[0]
        )
          return vue.$children[0];

        return vue;
      }
      return vue.$parent;
    },

    emitChanges(evt) {
      this.$nextTick(() => {
        this.$emit("change", evt);
      });
    },

    alterList(onList) {
      if (this.list) {
        onList(this.list);
        return;
      }
      const newList = [...this.value];
      onList(newList);
      this.$emit("input", newList);
    },

    spliceList() {
      const spliceList = list => list.splice(...arguments);
      this.alterList(spliceList);
    },

    removeAllFromList(indicies) {
      const spliceList = list =>
        indicies.forEach(index => list.splice(index, 1));
      this.alterList(spliceList);
    },

    updatePosition(oldIndex, newIndex) {
      const updatePosition = list =>
        list.splice(newIndex, 0, list.splice(oldIndex, 1)[0]);
      this.alterList(updatePosition);
    },

    /**
     * @param {number[]} oldIndicies
     * @param {number} newIndex
     */
    updatePositions(oldIndicies, newIndex) {
      /** @type {<T = any>(list: T[]) => T[]} */
      const updatePosition = list => {
        // get selected items with correct order
        // sort -> reverse (for prevent Array.splice side effect) -> splice -> reverse
        const items = oldIndicies
          .sort()
          .reverse()
          .flatMap(oldIndex => list.splice(oldIndex, 1))
          .reverse();
        return list.splice(newIndex, 0, ...items);
      };
      this.alterList(updatePosition);
    },

    getRelatedContextFromMoveEvent({ to, related }) {
      const component = this.getUnderlyingPotencialDraggableComponent(to);
      if (!component) {
        return { component };
      }
      const list = component.realList;
      const context = { list, component };
      if (to !== related && list && component.getUnderlyingVm) {
        const destination = component.getUnderlyingVm(related);
        if (destination) {
          return Object.assign(destination, context);
        }
      }
      return context;
    },

    getVmIndex(domIndex) {
      const indexes = this.visibleIndexes;
      const numberIndexes = indexes.length;
      return domIndex > numberIndexes - 1 ? numberIndexes : indexes[domIndex];
    },

    getComponent() {
      return this.$slots.default[0].componentInstance;
    },

    resetTransitionData(index) {
      if (!this.noTransitionOnDrag || !this.transitionMode) {
        return;
      }
      var nodes = this.getChildrenNodes();
      nodes[index].data = null;
      const transitionContainer = this.getComponent();
      transitionContainer.children = [];
      transitionContainer.kept = undefined;
    },

    onDragStart(evt) {
      if (Array.isArray(evt.items) && evt.items.length) {
        this.multidragContexts = evt.items.map(e => this.getUnderlyingVm(e));
        const elements = this.multidragContexts
          .sort(({ index: a }, { index: b }) => a - b)
          .map(e => e.element);
        evt.item._underlying_vm_multidrag_ = this.clone(elements);
      }
      this.context = this.getUnderlyingVm(evt.item);
      evt.item._underlying_vm_ = this.clone(this.context.element);
      draggingElement = evt.item;
    },

    onDragAdd(evt) {
      if (Array.isArray(evt.items) && evt.items.length) {
        this.onDragAddMulti(evt);
      } else {
        this.onDragAddSingle(evt);
      }
    },

    onDragAddMulti(evt) {
      const elements = evt.item._underlying_vm_multidrag_;
      if (elements === undefined) {
        return;
      }
      // remove nodes
      evt.items.forEach(e => removeNode(e));
      // insert elements
      const newIndex = this.getVmIndex(evt.newIndex);
      this.spliceList(newIndex, 0, ...elements);
      this.computeIndexes();
      // emit change
      const added = elements.map((element, index) => ({
        element,
        newIndex: newIndex + index
      }));
      this.emitChanges({ added });
    },

    onDragAddSingle(evt) {
      const element = evt.item._underlying_vm_;
      if (element === undefined) {
        return;
      }
      removeNode(evt.item);
      const newIndex = this.getVmIndex(evt.newIndex);
      this.spliceList(newIndex, 0, element);
      this.computeIndexes();
      const added = { element, newIndex };
      this.emitChanges({ added });
    },

    onDragRemove(evt) {
      if (Array.isArray(evt.items) && evt.items.length) {
        this.onDragRemoveMulti(evt);
      } else {
        this.onDragRemoveSingle(evt);
      }
    },

    onDragRemoveMulti(evt) {
      // for match item index and element index
      const headerSize = (this.$slots.header || []).length || 0;
      // sort old indicies
      // - "order by index asc" for prevent Node.insertBefore side effect
      const items = evt.oldIndicies.sort(({ index: a }, { index: b }) => a - b);
      // restore nodes
      items.forEach(({ multiDragElement: item, index }) => {
        insertNodeAt(this.rootContainer, item, index);
        if (item.parentNode) {
          Sortable.utils.deselect(item);
        }
      });
      // if clone
      if (evt.pullMode === "clone") {
        removeNode(evt.clone);
        return;
      }
      // remove items and reset transition data
      // - "order by index desc" (call reverse()) for prevent Array.splice side effect
      const indiciesToRemove = getIndiciesToRemove(items, headerSize);
      indiciesToRemove.forEach(oldIndex => this.resetTransitionData(oldIndex));
      this.removeAllFromList(indiciesToRemove);
      // emit change
      const removed = indiciesToRemove.sort().map(oldIndex => {
        const context = this.multidragContexts.find(e => e.index === oldIndex);
        return { element: context.element, oldIndex };
      });
      this.emitChanges({ removed });
    },

    onDragRemoveSingle(evt) {
      insertNodeAt(this.rootContainer, evt.item, evt.oldIndex);
      if (evt.pullMode === "clone") {
        removeNode(evt.clone);
        return;
      }
      const oldIndex = this.context.index;
      this.spliceList(oldIndex, 1);
      const removed = { element: this.context.element, oldIndex };
      this.resetTransitionData(oldIndex);
      this.emitChanges({ removed });
    },

    onDragUpdate(evt) {
      if (Array.isArray(evt.items) && evt.items.length) {
        if (!evt.pullMode) this.onDragUpdateMulti(evt);
      } else {
        this.onDragUpdateSingle(evt);
      }
    },

    onDragUpdateMulti(evt) {
      const { items, from } = evt;
      // for match item index and element index
      const headerSize = (this.$slots.header || []).length || 0;
      // remove nodes
      items.forEach(item => removeNode(item));
      // sort items
      // note: "order by oldIndex asc" for prevent Node.insertBefore side effect
      const itemsWithIndex = Array.from(evt.oldIndicies).sort(
        ({ index: a }, { index: b }) => a - b
      );
      // insert nodes
      itemsWithIndex.forEach(e =>
        insertNodeAt(from, e.multiDragElement, e.index)
      );
      // move items
      const oldIndicies = itemsWithIndex.map(({ index }) => index - headerSize);
      const newIndex = this.getVmIndex(evt.newIndex);
      // note: Array.from = prevent sort change side effect
      this.updatePositions(Array.from(oldIndicies), newIndex);
      // emit change
      const moved = oldIndicies.map((oldIndex, index) => {
        const context = this.multidragContexts.find(e => e.index === oldIndex);
        return {
          element: context.element,
          oldIndex,
          newIndex: newIndex + index
        };
      });
      this.emitChanges({ moved });
    },

    onDragUpdateSingle(evt) {
      removeNode(evt.item);
      insertNodeAt(evt.from, evt.item, evt.oldIndex);
      const oldIndex = this.context.index;
      const newIndex = this.getVmIndex(evt.newIndex);
      this.updatePosition(oldIndex, newIndex);
      const moved = { element: this.context.element, oldIndex, newIndex };
      this.emitChanges({ moved });
    },

    updateProperty(evt, propertyName) {
      evt.hasOwnProperty(propertyName) &&
        (evt[propertyName] += this.headerOffset);
    },

    computeFutureIndex(relatedContext, evt) {
      if (!relatedContext.element) {
        return 0;
      }
      const domChildren = [...evt.to.children].filter(
        el => el.style["display"] !== "none"
      );
      const currentDOMIndex = domChildren.indexOf(evt.related);
      const currentIndex = relatedContext.component.getVmIndex(currentDOMIndex);
      const draggedInList = domChildren.indexOf(draggingElement) !== -1;
      return draggedInList || !evt.willInsertAfter
        ? currentIndex
        : currentIndex + 1;
    },

    onDragMove(evt, originalEvent) {
      const onMove = this.move;
      if (!onMove || !this.realList) {
        return true;
      }

      const relatedContext = this.getRelatedContextFromMoveEvent(evt);
      const draggedContext = this.context;
      const futureIndex = this.computeFutureIndex(relatedContext, evt);
      Object.assign(draggedContext, { futureIndex });
      const sendEvt = Object.assign({}, evt, {
        relatedContext,
        draggedContext
      });
      return onMove(sendEvt, originalEvent);
    },

    onDragEnd() {
      this.computeIndexes();
      draggingElement = null;
    }
  }
};

if (typeof window !== "undefined" && "Vue" in window) {
  window.Vue.component("draggable", draggableComponent);
}

export default draggableComponent;
