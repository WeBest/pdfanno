import { scaleDown, scaleUp, getAnnoLayerBoundingRect, getCurrentPage } from './utils'
import SpanAnnotation from '../annotation/span'
import * as textInput from '../utils/textInput'

function scale () {
  return window.PDFView.pdfViewer.getPageView(0).viewport.scale
}

let prevprevSelectionRects
let prevSelectionRects

// TODO Need a good idea.
function watchSelectionRects () {
  setInterval(() => {
    prevprevSelectionRects = prevSelectionRects
    prevSelectionRects = getSelectionRects()
  }, 250)
}
watchSelectionRects()

/**
 * Get the current window selections and texts.
 */
function getSelectionRects () {
  try {
    let selection = window.getSelection()

    if (selection.rangeCount === 0) {
      return { rects : null, selectedText : null, textRange : null }
    }
    let range = selection.getRangeAt(0)
    let rects = range.getClientRects()

    // console.log('selection:', selection)
    const pageNumber = getPageNumber(selection.anchorNode)
    const startIndex = getIndex(selection.anchorNode)
    const endIndex = getIndex(selection.focusNode)
    // console.log('t:', pageNumber, startIndex, endIndex)

    // When no text is selected.
    if ((pageNumber === null || pageNumber === undefined)
      || (startIndex === null || startIndex === undefined)
      || (endIndex === null || endIndex === undefined)) {
      return { rects : null, selectedText : null, textRange : null }
    }

    // TODO a little tricky.
    const { text, textRange } = window.getText(pageNumber, startIndex, endIndex)
    // console.log('text:', text)
    // console.log('textRange:', textRange)

    // Bug detect.
    // This selects loadingIcon and/or loadingSpacer.
    if (selection.anchorNode && selection.anchorNode.tagName === 'DIV') {
      return { rects : null, selectedText : null, textRange : null }
    }

    if (rects.length > 0 && rects[0].width > 0 && rects[0].height > 0) {
      return { rects : mergeRects(rects), selectedText : text, textRange }
    }

  } catch (e) {
    console.log('ERROR:', e)
  }

  return { rects : null, selectedText : null, textRange : null }
}

function getPageNumber (elm) {
  if (elm.parentNode.hasAttribute('data-page')) {
    return parseInt(elm.parentNode.getAttribute('data-page'), 10)
  } else if (elm.hasAttribute && elm.hasAttribute('data-page')) {
    return parseInt(elm.getAttribute('data-page'), 10)
  }
  return null
}

function getIndex (elm) {
  if (elm.parentNode.hasAttribute('data-index')) {
    return parseInt(elm.parentNode.getAttribute('data-index'), 10)
  } else if (elm.hasAttribute && elm.hasAttribute('data-index')) {
    return parseInt(elm.getAttribute('data-index'), 10)
  }
  return null
}

/**
 * Merge user selections.
 */
function mergeRects (rects) {

  // Remove null ones.
  rects = rects.map(rect => rect)

  // Normalize.
  rects = rects.map(rect => {
    rect.top = rect.top || rect.y
    rect.left = rect.left || rect.x
    rect.right = rect.right || (rect.x + rect.w)
    rect.bottom = rect.bottom || (rect.y + rect.h)
    return rect
  })

  // Trim a rect which is almost same to other.
  rects = trimRects(rects)

  // a virtical margin of error.
  const error = 5 * scale()

  let tmp = convertToObject(rects[0])
  let newRects = [tmp]
  for (let i = 1; i < rects.length; i++) {

    // Same line -> Merge rects.
    if (withinMargin(rects[i].top, tmp.top, error)) {
      tmp.top    = Math.min(tmp.top, rects[i].top)
      tmp.left   = Math.min(tmp.left, rects[i].left)
      tmp.right  = Math.max(tmp.right, rects[i].right)
      tmp.bottom = Math.max(tmp.bottom, rects[i].bottom)
      tmp.x      = tmp.left
      tmp.y      = tmp.top
      tmp.width  = tmp.right - tmp.left
      tmp.height = tmp.bottom - tmp.top

      // New line -> Create a new rect.
    } else {
      tmp = convertToObject(rects[i])
      newRects.push(tmp)
    }
  }

  return newRects
}

/**
 * Trim rects which is almost same other.
 */
function trimRects (rects) {

  const error = 1.5 * scale()

  let newRects = [rects[0]]

  for (let i = 1; i < rects.length; i++) {
    if (Math.abs(rects[i].left - rects[i - 1].left) < error) {
      // Almost same.
      continue
    }
    newRects.push(rects[i])
  }

  return newRects
}

/**
 * Convert a DOMList to a javascript plan object.
 */
function convertToObject (rect) {
  return {
    top    : rect.top,
    left   : rect.left,
    right  : rect.right,
    bottom : rect.bottom,
    x      : rect.x,
    y      : rect.y,
    width  : rect.width,
    height : rect.height
  }
}

/**
 * Check the value(x) within the range.
 */
function withinMargin (x, base, margin) {
  return (base - margin) <= x && x <= (base + margin)
}

/**
 * Remove user selections.
 */
function removeSelection () {
  let selection = window.getSelection()
  // Firefox
  selection.removeAllRanges && selection.removeAllRanges()
  // Chrome
  selection.empty && selection.empty()
}

/**
 * Save a rect annotation.
 */
// function saveSpan (text, zIndex = 10, color = '#ffff00', save = true) {
function saveSpan ({
  text = '',
  rects = [],
  textRange = [],
  zIndex = 10,
  color = '#ffff00',
  page = 1,
  save = true,
  focusToLabel = true,
  knob = true
}) {

  console.log('saveSpan:', ...arguments)

  // Get the rect area which User selected.
  // let { rects, selectedText, textRange } = getSelectionRects()
  // let { rects, selectedText, textRange } = prevprevSelectionRects || prevSelectionRects

  // let rects = selectedRects
  // let selectedText = selectedText
  // let textRange = selectedTextRanges

  // Remove the user selection.
  // removeSelection()

  if (!rects) {
    return
  }

  let scale = window.PDFView.pdfViewer.getPageView(0).viewport.scale
  // let paddingTop = 9 // parseFloat($('.page').css('borderTopWidth')) / scale
  // let paddingTop = parseFloat($('.page').css('borderTopWidth'))
  let paddingTop = 9
  // let paddingTop = 9.5  // why?


  // let pageHeight = parseFloat($('.page').css('height')) / scale
  // let pageHeight = window.PDFView.pdfViewer.getPageView(0).viewport.height
  let pageHeight = window.PDFView.pdfViewer.getPageView(0).viewport.viewBox[3]
  // pageHeight /= window.PDFView.pdfViewer.getPageView(0).viewport.scale

  let merginBetweenPages = 1

  let pageTopY = paddingTop + (paddingTop + pageHeight + merginBetweenPages) * (page - 1)
  // TODO これでAnnoを生成するとannoファイルのrectsがpdftxtとずれてしまう.

  // TODO ページが後ろの方に行くと、少しずれてしまう.

  console.log('pageTopY:', pageTopY, rects[0].top)

  // let boundingRect = getAnnoLayerBoundingRect()

  // Initialize the annotation
  let annotation = {
    rectangles : rects.map((r) => {
      // return scaleUp({
      return {
          x      : r.left, // - boundingRect.left,
          y      : r.top + pageTopY, // - boundingRect.top,
          width  : r.width || r.right - r.left,
          height : r.height || r.bottom - r.top
      }
    }).filter(r => r.width > 0 && r.height > 0 && r.x > -1 && r.y > -1),
    selectedText,
    text,
    textRange,
    zIndex,
    color,
    // page
    knob
  }

  // console.log('y:', annotation.rectangles[0].y)

  // if (annotation.rectangles.length === 0) {
  //   console.log('zero:', rects, rects.map((r) => {
  //     // return scaleUp({
  //     return {
  //       x      : r.left, // - boundingRect.left,
  //       y      : r.top, // - boundingRect.top,
  //       width  : r.width,
  //       height : r.height
  //     }
  //   }))
  // }


  // console.log('annotation:', annotation, rects.map((r) => {
  //   return scaleUp({
  //     x      : r.left, // - boundingRect.left,
  //     y      : r.top, // - boundingRect.top,
  //     width  : r.width,
  //     height : r.height
  //   })
  // }))

  // Save.
  let spanAnnotation = SpanAnnotation.newInstance(annotation)
  if (save) {
    spanAnnotation.save()
  }

  // Render.
  spanAnnotation.render()

  // Select.
  spanAnnotation.select()

  // Enable label input.
  if (focusToLabel) {
    textInput.enable({ uuid : spanAnnotation.uuid, autoFocus : true, text })
  }

  return spanAnnotation
}

/**
 * Get the rect area of User selected.
 */
export function getRectangles () {

  if (!currentPage || !startPosition || !endPosition) {
    return null

  } else {
    let targets = findTexts(currentPage, startPosition, endPosition)
    // Remove null(this means whitespace) items.
    targets = targets.filter(item => item)

    const mergedRect = mergeRects(targets)
    return mergedRect
  }





  // let { rects } = getSelectionRects()
  // let { rects } = prevprevSelectionRects || prevSelectionRects
  // let rects = selectedRects
  // if (!rects) {
  //   return null
  // }
  //
  // const boundingRect = getAnnoLayerBoundingRect()
  //
  // rects = [...rects].map(r => {
  //   return scaleDown({
  //     x      : r.left - boundingRect.left,
  //     y      : r.top - boundingRect.top,
  //     width  : r.width,
  //     height : r.height
  //   })
  // }).filter(r => r.width > 0 && r.height > 0 && r.x > -1 && r.y > -1)
  //
  // return rects
}

/**
 * Create a span by current texts selection.
 */
export function createSpan ({ text = null, zIndex = 10, color = null }) {

  if (!currentPage || !startPosition || !endPosition) {
    return null

  } else {
    let targets = findTexts(currentPage, startPosition, endPosition)
    // Remove null(this means whitespace) items.
    targets = targets.filter(item => item)

    if (targets.length === 0) {
      return null
    }

    const mergedRect = mergeRects(targets)
    const annotation = saveSpan({
      rects : mergedRect,
      page  : currentPage,
      text,
      zIndex,
      color
    })

    // Remove user selection.
    if (spanAnnotation) {
      spanAnnotation.destroy()
    }
    startPosition = null
    endPosition = null
    currentPage = null
    spanAnnotation = null

    return annotation
  }

  // return saveSpan({ text, zIndex, color })
}

// Temporary.
window.addEventListener('DOMContentLoaded', () => {

  // function getXY (e, pageElement) {
  //   const $viewer = $('#viewer')
  //   // let rect = $viewer[0].getBoundingClientRect()
  //   let rect = pageElement.getBoundingClientRect()
  //   let y = e.clientY + $viewer.scrollTop() - rect.top
  //   let x = e.clientX - rect.left - ($viewer.width() - $('#pageContainer1').width()) / 2
  //   return { x, y }
  // }
  //
  // function getTmpLayer () {
  //   return document.getElementById('annoLayer2')
  // }

  function addItem(item, page) {

    // if (items.filter(i => i.position === item.position).length === 0) {
    //   items.push(item)
    //   items = items.filter(i => i.position <= item.position)
    //   items = items.sort((o1, o2) => o1.position - o2.position)
    // }

    // const newPosition = item.position
    // const indexes = items.map(i => i.position).concat([newPosition])
    // const minIndex = indexes.reduce((prev, v) => Math.min(prev, v), Number.MAX_SAFE_INTEGER)
    // const maxIndex = indexes.reduce((prev, v) => Math.min(prev, v), -1)



  }

  function setPositions(e) {

    const canvasElement = e.currentTarget
    const pageElement = canvasElement.parentNode
    const page = parseInt(pageElement.getAttribute('data-page-number'))
    currentPage = page

    const { top, left } = canvasElement.getBoundingClientRect()
    const x = e.clientX - left
    const y = e.clientY - top

    // Find the data in pdftxt.
    const item = window.findText(page, scaleDown({ x, y }))
    console.log('item:', item) // { position, char, x, y, w, h }

    if (item) {
      if (!startPosition || !endPosition) {
        startPosition = item.position
        endPosition = item.position
      } else {
        // startPosition = Math.min(startPosition, item.position)
        // endPosition = Math.max(endPosition, item.position)
        endPosition = item.position
      }
    }
  }

  function makeSelections(e) {
    // const page = setPositions(e)
    setPositions(e)
    // if (startPosition) {
    //   const items = window.findTexts(page, startPosition, endPosition)
    //   console.log('items:', items)
    // }

    if (spanAnnotation) {
      spanAnnotation.destroy()
      spanAnnotation = null
    }

    let targets = findTexts(currentPage, startPosition, endPosition)
    // Remove null(this means whitespace) items.
    targets = targets.filter(item => item)

    if (targets.length > 0) {
      // console.log('items:', items)
      const mergedRect = mergeRects(targets)
      // console.log('mergedRect:', mergedRect)
      spanAnnotation = saveSpan({
        rects : mergedRect,
        page  : currentPage,
        save  : false,
        focusToLabel : false,
        color: '#0f0',
        knob : false
      })
      spanAnnotation.disable()
    }


    // if (items.length > 0) {
    //   // console.log('items:', items)
    //   const mergedRect = mergeRects(items)
    //   // console.log('mergedRect:', mergedRect)
    //   spanAnnotation = saveSpan({
    //     rects : mergedRect,
    //     page,
    //     save  : false,
    //     focusToLabel : false,
    //     color: '#0f0',
    //     knob : false
    //   })
    //   spanAnnotation.disable()
    // }
  }

  let overlay
  let startX
  let startY




  let items = []


  const $viewer = $('#viewer')

  $viewer.on('mousedown', '.canvasWrapper', e => {
    mouseDown = true
    items = []
    currentPage = null
    startPosition = null
    endPosition = null
    if (spanAnnotation) {
      spanAnnotation.destroy()
      spanAnnotation = null
    }
    makeSelections(e)
  })
  $viewer.on('mousemove', '.canvasWrapper', e => {
    if (mouseDown) {
      makeSelections(e)
    }
  })
  $viewer.on('mouseup', '.canvasWrapper', e => {
    if (mouseDown) {
      makeSelections(e)
    }
    mouseDown = false
    // items = []
    // currentPage = null
    // startPosition = null
    // endPosition = null
  })

  // $('.textLayer').on('mouseup', e => {
  //
  //   if (1 === 1) {
  //     return
  //   }
  //
  //   if (!overlay) {
  //     return
  //   }
  //
  //   let rect = {
  //     x : parseFloat(overlay.style.left),
  //     y : parseFloat(overlay.style.top),
  //     w : parseFloat(overlay.style.width),
  //     h : parseFloat(overlay.style.height)
  //   }
  //
  //   // console.log('1x:y:w:h:', rect, getCurrentPage(rect.y).minY)
  //
  //   $(overlay).remove()
  //   overlay = null
  //
  //   if (rect.w < 0 && rect.h < 0) {
  //     // return
  //   }
  //
  //   let pageData = getCurrentPage(rect.y)
  //   console.log('mouseup:', pageData, rect.y)
  //
  //   // Coordinates for a page.
  //   rect.y -= pageData.minY
  //
  //   console.log('2x:y:w:h:', rect, getCurrentPage(rect.y).minY)
  //
  //   // Scale fit.
  //   rect = scaleUp(rect)
  //
  //   // Find texts.
  //   const result = window.findTexts(pageData.page, rect)
  //   if (!result.text) {
  //     console.log('notFoundX:', rect.x, (rect.x + rect.w))
  //     console.log('notFoundY:', rect.y, (rect.y + rect.h))
  //     selectedText = ''
  //     selectedRects = null
  //     selectedTextRanges = null
  //     return
  //   } else {
  //     console.log('found', result.text)
  //   }
  //
  //   selectedText = result.text
  //   selectedRects = mergeRects(result.rects)
  //   selectedTextRanges = result.textRange
  //
  //   tmpAnnotation = saveSpan('', 10, '#ffff00', false)
  //
  //   console.log('span selected:', selectedText, selectedRects, selectedTextRanges)
  //
  // })

})

let mouseDown = false
let startPosition = null
let endPosition = null
let currentPage = null
let spanAnnotation = null



  let selectedText
let selectedRects
let selectedTextRanges

let tmpAnnotation



























