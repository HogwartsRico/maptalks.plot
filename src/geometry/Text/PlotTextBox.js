import * as maptalks from 'maptalks'
import autosize from 'autosize'
import {DEF_TEXT_STYEL} from '../../Constants'
import { merge, on, off, hasClass, setStyle, getStyle } from '../../utils'

const _options = {
  'autoPan': true,
  'autoCloseOn': null,
  'autoOpenOn': 'click',
  'width': 300,
  'minHeight': 120,
  'custom': false,
  'title': null,
  'content': null
}

class PlotTextBox extends maptalks.UIComponent {
  constructor (options = {}) {
    const $options = merge(_options, options)
    super()
    this.options = $options
    /**
     * 地图交互
     * @type {undefined}
     */
    this.mapDragPan = undefined

    /**
     * is click
     * @type {boolean}
     * @private
     */
    this.isClick_ = false

    /**
     * 是否处于拖拽状态
     * @type {boolean}
     * @private
     */
    this.dragging_ = false

    /**
     * 当前气泡是否获取焦点
     * @type {boolean}
     * @private
     */
    this.isFocus_ = false

    /**
     * 当前配置信息
     * @type {{}}
     * @private
     */
    this.options_ = options

    /**
     * 当前气泡位置
     * @type {Array}
     * @private
     */
    this._position = (options['position'] && options['position'].length > 0) ? options['position'] : []

    /**
     * 防抖延时
     * @type {null}
     * @private
     */
    this.handleTimer_ = null

    /**
     * 每次鼠标按下的位置
     * @type {Array}
     * @private
     */
    this.currentPixel_ = []

    /**
     * 创建text content
     */
    this.createTextContent(options)
  }

  /**
   * 创建文本框父容器
   * @param options
   */
  createTextContent (options) {
    const _className = options.className || 'maptalks-plot-text-editor'
    const content = document.createElement('textarea')
    content.className = _className
    content.style.width = options['width'] + 'px'
    content.style.height = options['height'] + 'px'
    content.style.minHeight = options['minHeight'] + 'px'
    content.setAttribute('id', options['id'])
    content.setAttribute('autofocus', true)
    on(content, 'focus', this.handleFocus_, this)
    on(content, 'blur', this.handleBlur_, this)
    on(content, 'click', this.handleClick_, this)
    on(content, 'mousedown', this.handleDragStart_, this)
    on(window, 'mouseup', this.handleDragEnd_, this)
    this.set('isPlotText', true)
    this.setElement(content)
    this.createCloseButton(options)
    this.createResizeButton(options)
    this.setPosition(this._position)
    this.fire('textBoxDrawEnd', {
      overlay: this,
      element: content,
      uuid: options['id']
    })
  }

  /**
   * 获取文本框
   * @returns {string}
   * @private
   */
  getTextAreaFromContent_ () {
    let _node = ''
    const childrens_ = Array.prototype.slice.call((this.element && this.element.children), 0)
    if (childrens_.length > 0) {
      childrens_.every(ele => {
        if (ele.nodeType === 1 && ele.nodeName.toLowerCase() === 'textarea') {
          _node = ele
          return false
        } else {
          return true
        }
      })
    }
    return _node
  }

  /**
   * 创建关闭按钮
   * @param options
   */
  createCloseButton (options) {
    const _closeSpan = document.createElement('span')
    _closeSpan.className = 'maptalks-plot-text-editor-close'
    _closeSpan.setAttribute('data-id', options['id'])
    off(_closeSpan, 'click', this.closeCurrentPlotText, this)
    on(_closeSpan, 'click', this.closeCurrentPlotText, this)
    this.element.appendChild(_closeSpan)
  }

  /**
   * 创建文本框大小调整按钮
   * @param options
   */
  createResizeButton (options) {
    const _resizeSpan = document.createElement('span')
    _resizeSpan.className = 'maptalks-plot-text-editor-resize'
    _resizeSpan.setAttribute('data-id', options['id'])
    off(_resizeSpan, 'mousedown', this.handleResizeMouseDown_, this)
    off(_resizeSpan, 'mousemove', this.handleResizeMouseMove_, this)
    on(_resizeSpan, 'mousedown', this.handleResizeMouseDown_, this)
    on(_resizeSpan, 'mousemove', this.handleResizeMouseMove_, this)
    this.element.appendChild(_resizeSpan)
  }

  /**
   * 调整大小
   * @param event
   * @private
   */
  resizeButtonMoveHandler_ (event) {
    const pixel_ = event.pixel
    const element_ = this.getTextAreaFromContent_()
    if (pixel_.length < 1 || this.currentPixel_.length < 1 || !element_) return
    const _offset = [pixel_[0] - this.currentPixel_[0], pixel_[1] - this.currentPixel_[1]]
    const _size = [element_.offsetWidth, element_.offsetHeight]
    const _width = _size[0] + _offset[0] * 2
    const _height = _size[1] + _offset[1] * 2
    setStyle(element_, 'width', _width + 'px')
    setStyle(element_, 'height', _height + 'px')
    this.currentPixel_ = pixel_
    this.getMap().render()
  }

  /**
   * 处理移动事件
   * @param event
   * @private
   */
  handleResizeMouseMove_ (event) {
    event.stopImmediatePropagation()
  }

  /**
   * 处理鼠标按下事件
   * @param event
   * @private
   */
  handleResizeMouseDown_ (event) {
    if (!this.getMap()) return
    this.currentPixel_ = [event.x, event.y]
    this.getMap().on('pointermove', this.resizeButtonMoveHandler_, this)
    on(this.getMap().getViewport(), 'mouseup', this.handleResizeMouseUp_, this)
  }

  /**
   * 处理鼠标抬起事件，移除所有事件监听
   * @param event
   * @private
   */
  handleResizeMouseUp_ (event) {
    if (!this.getMap()) return
    this.getMap().un('pointermove', this.resizeButtonMoveHandler_, this)
    off(this.getMap().getViewport(), 'mouseup', this.handleResizeMouseUp_, this)
    this.currentPixel_ = []
  }

  /**
   * 处理关闭事件
   * @param event
   */
  closeCurrentPlotText (event) {
    if (!this.getMap()) return
    if (event && hasClass(event.target, 'maptalks-plot-text-editor-close')) {
      let _id = event.target.getAttribute('data-id')
      if (_id) {
        const _overlay = this.getMap().getOverlayById(_id)
        if (_overlay) {
          this.getMap().removeOverlay(_overlay)
        }
      }
    }
  }

  /**
   * 处理获取焦点事件
   * @private
   */
  handleFocus_ () {
    this.isFocus_ = true
    if (this.getMap()) {
      this.getMap().set('activeTextArea', this)
      this.getMap().dispatchEvent('activeTextArea')
    }
  }

  /**
   * 处理失去焦点事件
   * @private
   */
  handleBlur_ () {
    this.isFocus_ = false
    if (this.getMap()) {
      this.getMap().set('activeTextArea', null)
      this.getMap().set('disActiveTextArea', this)
      this.getMap().dispatchEvent('disActiveTextArea')
    }
  }

  /**
   * 处理拖拽开始
   * @private
   */
  handleDragStart_ (event) {
    if (!this.getMap()) return
    if (!this.dragging_ && this.isMoveModel() && this.isFocus_) {
      this.handleTimer_ = window.setTimeout(() => {
        window.clearTimeout(this.handleTimer_)
        this.handleTimer_ = null
        if (!this.isClick_) {
          this.dragging_ = true
          this.disableMapDragPan()
          this.preCursor_ = this.element.style.cursor
          on(this.getMap().getViewport(), 'mousemove', this.handleDragDrag_, this)
          on(this.element, 'mouseup', this.handleDragEnd_, this)
        }
      }, 300)
    }
  }

  /**
   * 处理拖拽
   * @param event
   * @private
   */
  handleDragDrag_ (event) {
    if (this.dragging_) {
      this.element.style.cursor = 'move'
      this._position = this.getMap().getCoordinateFromPixel([event.clientX, event.clientY])
      this.setPosition(this._position)
    }
  }

  /**
   * 处理拖拽
   * @private
   */
  handleDragEnd_ (event) {
    this.isClick_ = false
    window.clearTimeout(this.handleTimer_)
    this.handleTimer_ = null
    if (this.dragging_ && this.isFocus_) {
      this.dragging_ = false
      this.enableMapDragPan()
      this.element.style.cursor = this.preCursor_
      off(this.getMap().getViewport(), 'mousemove', this.handleDragDrag_, this)
      off(this.element, 'mouseup', this.handleDragEnd_, this)
    }
  }

  /**
   * 处理点击事件
   * @param event
   * @private
   */
  handleClick_ (event) {
    if (event.target === this.element) {
      this.isClick_ = true
    } else {
      this.isClick_ = false
    }
  }

  /**
   * 是否处于选择模式
   * @returns {boolean}
   */
  isMoveModel () {
    const range = window.getSelection().getRangeAt(0)
    return range.collapsed
  }

  /**
   * 设置样式
   * @param style
   */
  setStyle (style = {}) {
    const _element = this.getTextAreaFromContent_()
    if (_element) {
      for (let key in style) {
        if (style[key]) {
          setStyle(_element, key, style[key])
        }
      }
    }
  }

  /**
   * 获取当前样式
   * @returns {CSSStyleDeclaration}
   */
  getStyle () {
    const _style = {}
    const _element = this.getTextAreaFromContent_()
    if (_element) {
      for (let key in DEF_TEXT_STYEL) {
        _style[key] = getStyle(_element, key)
      }
    }
    return _style
  }

  /**
   * set value
   * @param value
   */
  setValue (value) {
    const _element = this.getTextAreaFromContent_()
    if (_element) {
      _element.value = value
      if (value) {
        autosize.update(_element)
      }
      this.getMap().render()
    }
  }

  /**
   * get value
   * @returns {*}
   */
  getValue () {
    const _element = this.getTextAreaFromContent_()
    if (_element) {
      return _element.value
    } else {
      return ''
    }
  }

  /**
   * 获取宽度
   * @returns {number}
   */
  getWidth () {
    const element_ = this.getTextAreaFromContent_()
    if (element_ && element_.offsetWidth) {
      return element_.offsetWidth
    } else {
      return 0
    }
  }

  /**
   * 获取高度
   * @returns {number}
   */
  getHeight () {
    const element_ = this.getTextAreaFromContent_()
    if (element_ && element_.offsetHeight) {
      return element_.offsetHeight
    } else {
      return 0
    }
  }

  /**
   * 激活地图的拖拽平移
   */
  enableMapDragPan () {
    const _map = this.getMap()
    if (!_map) return
    _map.config({
      'draggable': this.mapDragPan
    })
  }

  /**
   * 禁止地图的拖拽平移
   */
  disableMapDragPan () {
    const _map = this.getMap()
    if (!_map) return
    this.mapDragPan = _map.options['draggable']
    _map.config({
      'draggable': false
    })
  }

  /**
   * set map
   * @param map
   */
  setMap (map) {
    maptalks.UIComponent.prototype.addTo.call(this, map)
    if (map && map instanceof maptalks.Map) {
      this.setStyle(merge(DEF_TEXT_STYEL, this.options_['style']))
      this.setValue(this.options_['value'])
    }
  }
}

export default PlotTextBox
