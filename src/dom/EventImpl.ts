import {
  Event, EventInit, EventTarget, EventPhase
} from './interfaces'

type PotentialEventTarget = EventTarget | null

/**
 * Represents an object on the event path.
 */
type EventPathItem = {
  invocationTarget: EventTarget
  invocationTargetInShadowTree: boolean
  shadowAdjustedTarget: EventTarget | null
  relatedTarget: EventTarget | null
  touchTargetList: PotentialEventTarget[]
  rootOfClosedTree: boolean
  slotInClosedTree: boolean
}

/**
 * Represents a generic XML node.
 */
export class EventImpl implements Event {

  static readonly NONE: number = 0
  static readonly CAPTURING_PHASE: number = 1
  static readonly AT_TARGET: number = 2
  static readonly BUBBLING_PHASE: number = 3

  protected _type: string

  protected _target: PotentialEventTarget = null
  protected _relatedTarget: PotentialEventTarget = null
  protected _touchTargetList: PotentialEventTarget[] = []
  protected _path: EventPathItem[] = []
  protected _currentTarget: PotentialEventTarget = null
  protected _eventPhase: EventPhase = EventPhase.None

  protected _bubbles: boolean = false
  protected _cancelable: boolean = false

  protected _stopPropagation: boolean = false
  protected _stopImmediatePropagation: boolean = false
  protected _canceled: boolean = false
  protected _inPassiveListener: boolean = false
  protected _composed: boolean = false
  protected _initialized: boolean = false
  protected _dispatch: boolean = false

  protected _isTrusted: boolean = false
  protected _timeStamp: number

  /**
   * Initializes a new instance of `Event`.
   */
  constructor(type: string, eventInit?: EventInit) {
    this._type = type
    if (eventInit) {
      this._bubbles = eventInit.bubbles || false
      this._cancelable = eventInit.cancelable || false
      this._composed = eventInit.composed || false
    }
    this._initialized = true
    this._timeStamp = new Date().getTime()
  }

  /**
   * Returns the type of event.
   */
  get type(): string { return this._type }

  /**
   * Returns the object to which event is dispatched (its target).
   */
  get target(): EventTarget | null { return this._target }

  /**
   * Historical alias of target.
   */
  get srcElement(): EventTarget | null { return this._target }

  /**
   * Returns the object whose event listener's callback is currently
   * being invoked.
   */
  get currentTarget(): EventTarget | null { return this._currentTarget }

  /**
   * Returns the event's path (objects on which listeners will be 
   * invoked). This does not include nodes in shadow trees if the 
   * shadow root was created with its `mode` `"closed"`.
   */
  composedPath(): EventTarget[] {

    const composedPath: EventTarget[] = []

    const path = this._path

    if (path.length == 0) return composedPath

    const currentTarget = this.currentTarget
    if (currentTarget === null) {
      throw new Error("Event currentTarget is null.")
    }
    composedPath.push(currentTarget)

    let currentTargetIndex = 0
    let currentTargetHiddenSubtreeLevel = 0

    let index = path.length - 1
    while (index >= 0) {
      if (path[index].rootOfClosedTree) {
        currentTargetHiddenSubtreeLevel++
      }
      if (path[index].invocationTarget === currentTarget) {
        currentTargetIndex = index
        break
      }
      if (path[index].slotInClosedTree) {
        currentTargetHiddenSubtreeLevel--
      }
      index--
    }

    let currentHiddenLevel = currentTargetHiddenSubtreeLevel
    let maxHiddenLevel = currentTargetHiddenSubtreeLevel

    index = currentTargetIndex - 1
    while (index >= 0) {
      if (path[index].rootOfClosedTree) {
        currentHiddenLevel++
      }

      if (currentHiddenLevel <= maxHiddenLevel) {
        composedPath.unshift(path[index].invocationTarget)
      }

      if (path[index].slotInClosedTree) {
        currentHiddenLevel--
        if (currentHiddenLevel < maxHiddenLevel) {
          maxHiddenLevel = currentHiddenLevel
        }
      }

      index--
    }

    currentHiddenLevel = currentTargetHiddenSubtreeLevel
    maxHiddenLevel = currentTargetHiddenSubtreeLevel
    index = currentTargetIndex + 1

    while (index < path.length) {
      if (path[index].slotInClosedTree) {
        currentHiddenLevel++
      }

      if (currentHiddenLevel <= maxHiddenLevel) {
        composedPath.push(path[index].invocationTarget)
      }

      if (path[index].rootOfClosedTree) {
        currentHiddenLevel--
        if (currentHiddenLevel < maxHiddenLevel) {
          maxHiddenLevel = currentHiddenLevel
        }
      }

      index++
    }

    return composedPath
  }

  /**
   * Returns the event's phase.
   */
  get eventPhase(): EventPhase { return this._eventPhase }

  /**
   * Prevents event from reaching any objects other than the current 
   * object.
   */
  stopPropagation(): void { this._stopPropagation = true }

  /**
   * Historical alias of `stopPropagation()`.
   */
  get cancelBubble(): boolean { return this._stopPropagation }
  set cancelBubble(value: boolean) { if (value) this.stopPropagation() }

  /**
   * Prevents event from reaching any registered event listeners after 
   * the current one finishes running.
   */
  stopImmediatePropagation(): void {
    this._stopPropagation = true
    this._stopImmediatePropagation = true
  }

  /**
   * Returns `true` if the event goes through its target's ancestors in
   * reverse tree order, and `false` otherwise.
   */
  get bubbles(): boolean { return this._bubbles }

  /**
   * A historical alias of `stopPropagation()`.
   */
  get cancelable(): boolean { return this._cancelable }

  /**
   * Historical property.
   */
  get returnValue(): boolean { return !this._canceled }
  set returnValue(value: boolean) { if (!value) EventImpl._setCanceled(this) }

  /**
   * Cancels the event (if it is cancelable).
   */
  preventDefault(): void { EventImpl._setCanceled(this) }

  /**
   * Indicates whether the event was cancelled with `preventDefault()`.
   */
  get defaultPrevented(): boolean { return this._canceled }

  /**
   * Determines whether the event can bubble to the shadow DOM.
   */
  get composed(): boolean { return this._composed }

  /**
   * Returns `true` if event was dispatched by the user agent, and
   * `false` otherwise.
   */
  get isTrusted(): boolean { return this._isTrusted }

  /**
   * Returns the the number of milliseconds measured relative to the
   * time origin.
   */
  get timeStamp(): number { return this._timeStamp }

  /**
   * Historical method to initializes the value of an event.
   * 
   * @param type - the type of event.
   * @param bubbles - whether the event propagates in reverse.
   * @param cancelable - whether the event can be cancelled.
   */
  initEvent(type: string, bubbles = false, cancelable = false): void {
    if (this._dispatch) return

    EventImpl._initialize(this, type, bubbles, cancelable)
  }

  /**
   * Sets the canceled flag of an event.
   * 
   * @param event - an event
   */
  protected static _setCanceled(event: Event): void {
    const impl = <EventImpl>event

    if (impl._cancelable && !impl._inPassiveListener) {
      impl._canceled = true
    }
  }

  /**
   * Initializes the value of an event.
   * 
   * @param event - an event to initialize
   * @param type - the type of event
   * @param bubbles - whether the event propagates in reverse
   * @param cancelable - whether the event can be cancelled
   */
  protected static _initialize(event: Event, type: string, bubbles: boolean, cancelable: boolean): void {
    const impl = <EventImpl>event

    impl._initialized = true
    impl._stopPropagation = false
    impl._stopImmediatePropagation = false
    impl._canceled = false
    impl._isTrusted = false
    impl._target = null

    impl._type = type
    impl._bubbles = bubbles
    impl._cancelable = cancelable
  }
}
