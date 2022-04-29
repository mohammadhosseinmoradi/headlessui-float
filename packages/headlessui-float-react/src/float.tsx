import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useContext,
  createContext,
  isValidElement,
  Fragment,

  // types
  ElementType,
  ReactElement,
  RefObject,
  MutableRefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { useFloating, offset, flip, shift, arrow, autoPlacement, hide, autoUpdate } from '@floating-ui/react-dom'
import { Transition } from '@headlessui/react'
import throttle from 'lodash.throttle'
import { OriginClassResolver, tailwindcssOriginClassResolver } from './origin-class-resolvers'
import { useId } from './hooks/use-id'
import { useIsoMorphicEffect } from './hooks/use-iso-morphic-effect'
import type { VirtualElement } from '@floating-ui/core'
import type { Options as OffsetOptions } from '@floating-ui/core/src/middleware/offset'
import type { Options as ShiftOptions } from '@floating-ui/core/src/middleware/shift'
import type { Options as FlipOptions } from '@floating-ui/core/src/middleware/flip'
import type { Options as AutoPlacementOptions } from '@floating-ui/core/src/middleware/autoPlacement'
import type { Options as HideOptions } from '@floating-ui/core/src/middleware/hide'
import type { Placement, Strategy, Middleware, DetectOverflowOptions } from '@floating-ui/dom'
import type { Options as AutoUpdateOptions } from '@floating-ui/dom/src/autoUpdate'

let autoUpdateCleanerMap = new Map<ReturnType<typeof useId>, (() => void)>()
let showStateMap = new Map<ReturnType<typeof useId>, boolean>()

interface ArrowState {
  arrowRef: RefObject<HTMLElement>
  placement: Placement
  x: number | undefined
  y: number | undefined
}

const ArrowContext = createContext<ArrowState | null>(null)
ArrowContext.displayName = 'ArrowContext'

export function useArrowContext(component: string) {
  let context = useContext(ArrowContext)
  if (context === null) {
    let err = new Error(`<${component} /> is missing a parent <Float /> component.`)
    if (Error.captureStackTrace) Error.captureStackTrace(err, useArrowContext)
    throw err
  }
  return context
}

export interface FloatProps {
  as?: ElementType
  show?: boolean
  placement?: Placement
  strategy?: Strategy
  offset?: OffsetOptions
  shift?: boolean | number | Partial<ShiftOptions & DetectOverflowOptions>
  flip?: boolean | number | Partial<FlipOptions & DetectOverflowOptions>
  arrow?: boolean | number
  autoPlacement?: boolean | Partial<AutoPlacementOptions & DetectOverflowOptions>
  hide?: boolean | Partial<HideOptions & DetectOverflowOptions>
  autoUpdate?: boolean | Partial<AutoUpdateOptions>
  zIndex?: number | string
  enter?: string
  enterFrom?: string
  enterTo?: string
  leave?: string
  leaveFrom?: string
  leaveTo?: string
  originClass?: string | OriginClassResolver
  tailwindcssOriginClass?: boolean
  portal?: boolean | string
  transform?: boolean
  middleware?: Middleware[] | ((refs: {
    referenceEl: MutableRefObject<Element | VirtualElement | null>
    floatingEl: MutableRefObject<HTMLElement | null>
  }) => Middleware[])
  children: ReactElement[]
  onShow?: () => void
  onHide?: () => void
  onUpdate?: () => void
}

function FloatRoot(props: FloatProps) {
  const id = useId()

  const [isMounted, setIsMounted] = useState(false)
  const [show, setShow] = useState(props.show !== undefined ? props.show : false)

  const [middleware, setMiddleware] = useState<Middleware[]>()
  const arrowRef = useRef<HTMLElement>(null)

  const events = {
    show: props.onShow || (() => {}),
    hide: props.onHide || (() => {}),
    update: props.onUpdate || (() => {}),
  }

  const { x, y, placement, strategy, reference, floating, update, refs, middlewareData } = useFloating({
    placement: props.placement || 'bottom-start',
    strategy: props.strategy,
    middleware,
  })

  const updateFloating = useCallback(() => {
    update()
    events.update()
  }, [update])

  useEffect(() => {
    const _middleware = []
    if (typeof props.offset === 'number' ||
        typeof props.offset === 'object' ||
        typeof props.offset === 'function'
    ) {
      _middleware.push(offset(props.offset))
    }
    if (props.flip === true ||
        typeof props.flip === 'number' ||
        typeof props.flip === 'object'
    ) {
      _middleware.push(flip({
        padding: typeof props.flip === 'number' ? props.flip : undefined,
        ...(typeof props.flip === 'object' ? props.flip : {}),
      }))
    }
    if (props.shift === true ||
        typeof props.shift === 'number' ||
        typeof props.shift === 'object'
    ) {
      _middleware.push(shift({
        padding: typeof props.shift === 'number' ? props.shift : undefined,
        ...(typeof props.shift === 'object' ? props.shift : {}),
      }))
    }
    if (props.autoPlacement === true || typeof props.autoPlacement === 'object') {
      _middleware.push(autoPlacement(
        typeof props.autoPlacement === 'object'
          ? props.autoPlacement
          : undefined
      ))
    }
    if (props.arrow === true || typeof props.arrow === 'number') {
      _middleware.push(arrow({
        element: arrowRef,
        padding: props.arrow === true ? 0 : props.arrow,
      }))
    }
    _middleware.push(...(
      typeof props.middleware === 'function'
        ? props.middleware({
          referenceEl: refs.reference,
          floatingEl: refs.floating,
        })
        : props.middleware || []
    ))
    if (props.hide === true || typeof props.hide === 'object') {
      _middleware.push(hide(
        typeof props.hide === 'object' ? props.hide : undefined
      ))
    }
    setMiddleware(_middleware)
  }, [
    props.offset,
    props.shift,
    props.flip,
    props.arrow,
    props.autoPlacement,
    props.hide,
    props.middleware,
  ])

  const startAutoUpdate = () => {
    if (refs.reference.current &&
        refs.floating.current &&
        props.autoUpdate !== false &&
        !autoUpdateCleanerMap.get(id)
    ) {
      autoUpdateCleanerMap.set(id, autoUpdate(
        refs.reference.current,
        refs.floating.current,
        throttle(updateFloating, 16),
        typeof props.autoUpdate === 'object'
          ? props.autoUpdate
          : undefined
      ))
    }
  }

  const clearAutoUpdate = () => {
    const disposeAutoUpdate = autoUpdateCleanerMap.get(id)!
    disposeAutoUpdate()

    autoUpdateCleanerMap.delete(id)
  }

  useIsoMorphicEffect(() => {
    if (refs.reference.current &&
        refs.floating.current &&
        show === true &&
        !showStateMap.get(id)
    ) {
      showStateMap.set(id, true)

      // show...
      events.show()
      startAutoUpdate()
    } else if (
      show === false &&
      showStateMap.get(id) &&
      autoUpdateCleanerMap.get(id)
    ) {
      showStateMap.delete(id)

      // hide...
      clearAutoUpdate()
      events.hide()
    }
    return autoUpdateCleanerMap.get(id)
  }, [show])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const arrowApi = {
    arrowRef,
    placement,
    x: middlewareData.arrow?.x,
    y: middlewareData.arrow?.y,
  } as ArrowState

  const [ReferenceNode, FloatingNode] = props.children

  if (!isValidElement(ReferenceNode)) {
    return <Fragment />
  }

  const originClassValue = useMemo(() => {
    if (typeof props.originClass === 'function') {
      return props.originClass(placement)
    } else if (typeof props.originClass === 'string') {
      return props.originClass
    } else if (props.tailwindcssOriginClass) {
      return tailwindcssOriginClassResolver(placement)
    }
    return ''
  }, [props.originClass, props.tailwindcssOriginClass])

  const transitionProps = {
    show: isMounted ? props.show : false,
    enter: `${props.enter || ''} ${originClassValue}`,
    enterFrom: `${props.enterFrom || ''}`,
    enterTo: `${props.enterTo || ''}`,
    leave: `${props.leave || ''} ${originClassValue}`,
    leaveFrom: `${props.leaveFrom || ''}`,
    leaveTo: `${props.leaveTo || ''}`,
    beforeEnter: () => {
      setShow(true)
    },
    afterLeave: () => {
      setShow(false)
    },
  }

  const floatingProps = {
    ref: floating,
    style: props.transform || props.transform === undefined ? {
      position: strategy,
      zIndex: props.zIndex || 9999,
      top: 0,
      left: 0,
      right: 'auto',
      bottom: 'auto',
      transform: `translate(${Math.round(x || 0)}px,${Math.round(y || 0)}px)`,
    } : {
      position: strategy,
      zIndex: props.zIndex || 9999,
      top: `${y || 0}px`,
      left: `${x || 0}px`,
    },
  }

  const renderPortal = (children: ReactElement) => {
    if (isMounted && props.portal) {
      const root = document?.querySelector(props.portal === true ? 'body' : props.portal)
      if (root) {
        return createPortal(children, root)
      }
    }
    return children
  }

  const renderFloating = (Children: ReactElement) => {
    if (props.as === Fragment) {
      return <Children.type {...Children.props} {...floatingProps} />
    }

    const FloatingWrapper = props.as || 'div'
    return (
      <FloatingWrapper {...floatingProps}>
        <Children.type {...Children.props} />
      </FloatingWrapper>
    )
  }

  return (
    <>
      <ReferenceNode.type {...ReferenceNode.props} ref={reference} />
      <ArrowContext.Provider value={arrowApi}>
        {renderPortal(
          renderFloating(
            <Transition as={Fragment} {...transitionProps}>
              <FloatingNode.type {...FloatingNode.props} />
            </Transition>
          )
        )}
      </ArrowContext.Provider>
    </>
  )
}

interface ArrowRenderProp {
  placement: Placement
}

function Arrow(props: {
  as?: ElementType
  offset?: number
  className?: string | ((bag: ArrowRenderProp) => string)
  children?: ReactElement | ((slot: ArrowRenderProp) => ReactElement)
}) {
  const { arrowRef, placement, x, y } = useArrowContext('Float.Arrow')

  const staticSide = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  }[placement.split('-')[0]]!

  const style = {
    left: typeof x === 'number' ? `${x}px` : '',
    top: typeof y === 'number' ? `${y}px` : '',
    right: '',
    bottom: '',
    [staticSide]: `${(props.offset ?? 4) * -1}px`,
  }

  if (props.as === Fragment) {
    const slot = { placement }
    const ArrowNode = typeof props.children === 'function'
      ? props.children(slot)
      : props.children
    if (!ArrowNode || !isValidElement(ArrowNode)) {
      throw new Error('When the prop `as` of <Float.Arrow /> is <Fragment />, there must be contains 1 child element.')
    }
    return <ArrowNode.type {...ArrowNode.props} ref={arrowRef} style={style} />
  }

  const ArrowWrapper = props.as || 'div'
  return (
    <ArrowWrapper
      {...props}
      ref={arrowRef as RefObject<HTMLDivElement>}
      style={style}
    />
  )
}

export const Float = Object.assign(FloatRoot, { Arrow })
