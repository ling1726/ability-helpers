/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    augmentAttribute,
    getTabsterOnElement,
    setTabsterOnElement,
} from './Instance';
import { dispatchMutationEvent } from './MutationEvent';
import { RootAPI } from './Root';
import * as Types from './Types';
import { WeakHTMLElement } from './Utils';

let _lastInternalId = 0;

function _setInformativeStyle(
    weakElement: WeakHTMLElement,
    remove: boolean,
    internalId?: string,
    userId?: string,
    isActive?: boolean,
    isAccessible?: boolean,
    isFocused?: boolean
): void {
    if (__DEV__) {
        const element = weakElement.get();

        if (element) {
            if (remove) {
                element.style.removeProperty('--tabster-modalizer');
            } else {
                element.style.setProperty(
                    '--tabster-modalizer',
                    internalId +
                        ',' +
                        userId +
                        ',' +
                        (isActive ? 'active' : 'inactive') +
                        ',' +
                        (isAccessible ? 'accessible' : 'inaccessible') +
                        ',' +
                        (isFocused ? 'focused' : 'not-focused')
                );
            }
        }
    }
}

export class Modalizer implements Types.Modalizer {
    readonly internalId: string;
    userId: string;

    /* private */ _tabster: Types.TabsterCore;
    private _win: Types.GetWindow;
    private _element: WeakHTMLElement;
    private _basic: Types.ModalizerBasicProps;
    private _extended: Types.ModalizerExtendedProps;
    private _isActive: boolean | undefined;
    private _isAccessible = true;
    private _setAccessibleTimer: number | undefined;
    private _isFocused = false;

    constructor(
        element: HTMLElement,
        tabster: Types.TabsterCore,
        win: Types.GetWindow,
        basic: Types.ModalizerBasicProps,
        extended?: Types.ModalizerExtendedProps
    ) {
        this._tabster = tabster;
        this._win = win;

        this.internalId = 'ml' + ++_lastInternalId;
        this.userId = basic.id;

        this._element = new WeakHTMLElement(element);
        this._basic = basic;
        this._extended = extended || {};
        this._setAccessibilityProps();

        if (__DEV__) {
            _setInformativeStyle(
                this._element,
                false,
                this.internalId,
                this.userId,
                this._isActive,
                this._isAccessible,
                this._isFocused
            );
        }
    }

    setProps(
        basic?: Partial<Types.ModalizerBasicProps> | null,
        extended?: Partial<Types.ModalizerExtendedProps> | null
    ): void {
        if (basic) {
            if (basic.id) {
                this.userId = basic.id;
            }

            this._basic = { ...this._basic, ...basic };
        } else if (basic === null) {
            this._basic = { id: this.userId };
        }

        if (extended) {
            this._extended = { ...this._extended, ...extended };
        } else if (extended === null) {
            this._extended = {};
        }

        this._setAccessibilityProps();
    }

    dispose(): void {
        if (this._setAccessibleTimer) {
            this._win().clearTimeout(this._setAccessibleTimer);
            this._setAccessibleTimer = undefined;
        }

        if (this._isFocused) {
            this.setFocused(false);
        }

        this._remove();

        this._extended = {};
    }

    move(newElement: HTMLElement): void {
        this._remove();

        this._element = new WeakHTMLElement(newElement);

        this._setAccessibilityProps();

        this._isAccessible = !this._isAccessible;
        this._isActive = !this._isActive;

        this.setAccessible(!this._isAccessible);
        this.setActive(!this._isActive);
    }

    setAccessible(accessible: boolean): void {
        if (accessible === this._isAccessible) {
            return;
        }

        this._isAccessible = accessible;

        if (this._setAccessibleTimer) {
            this._win().clearTimeout(this._setAccessibleTimer);

            this._setAccessibleTimer = undefined;
        }

        const element = this._element.get();

        if (element) {
            if (accessible) {
                augmentAttribute(this._tabster, element, 'aria-hidden');
            } else {
                this._setAccessibleTimer = this._win().setTimeout(() => {
                    this._setAccessibleTimer = undefined;

                    augmentAttribute(
                        this._tabster,
                        element,
                        'aria-hidden',
                        'true'
                    );
                }, 0);
            }
        }

        if (__DEV__) {
            _setInformativeStyle(
                this._element,
                false,
                this.internalId,
                this.userId,
                this._isActive,
                this._isAccessible,
                this._isFocused
            );
        }
    }

    setActive(active: boolean): void {
        if (active === this._isActive) {
            return;
        }

        this._isActive = active;

        if (__DEV__) {
            _setInformativeStyle(
                this._element,
                false,
                this.internalId,
                this.userId,
                this._isActive,
                this._isAccessible,
                this._isFocused
            );
        }
    }

    isActive(): boolean {
        return !!this._isActive;
    }

    getElement(): HTMLElement | undefined {
        return this._element.get();
    }

    setFocused(focused: boolean): void {
        if (this._isFocused === focused) {
            return;
        }

        this._isFocused = focused;

        if (focused) {
            if (this._extended.onFocusIn) {
                this._extended.onFocusIn();
            }
        } else {
            if (this._extended.onFocusOut) {
                this._extended.onFocusOut(false);
            }
        }

        if (__DEV__) {
            _setInformativeStyle(
                this._element,
                false,
                this.internalId,
                this.userId,
                this._isActive,
                this._isAccessible,
                this._isFocused
            );
        }
    }

    onBeforeFocusOut(): boolean {
        if (this._extended.onFocusOut) {
            return this._extended.onFocusOut(true);
        }

        return false;
    }

    getBasicProps(): Types.ModalizerBasicProps {
        return this._basic;
    }

    getExtendedProps(): Types.ModalizerExtendedProps {
        return this._extended;
    }

    private _remove(): void {
        if (__DEV__) {
            _setInformativeStyle(this._element, true);
        }
    }

    private _setAccessibilityProps(): void {
        if (__DEV__ && !this._element.get()?.getAttribute('aria-label')) {
            console.error('Modalizer must have aria-label', this._element);

            return;
        }
    }
}

export class ModalizerAPI implements Types.ModalizerAPI {
    private _tabster: Types.TabsterCore;
    private _win: Types.GetWindow;
    private _initTimer: number | undefined;
    private _curModalizer: Types.Modalizer | undefined;
    private _focusOutTimer: number | undefined;

    constructor(tabster: Types.TabsterCore) {
        this._tabster = tabster;
        this._win = ((tabster as unknown) as Types.TabsterInternal).getWindow;
        this._initTimer = this._win().setTimeout(this._init, 0);
    }

    private _init = (): void => {
        this._initTimer = undefined;

        this._tabster.focusedElement.subscribe(this._onFocus);
    };

    protected dispose(): void {
        const win = this._win();

        if (this._initTimer) {
            win.clearTimeout(this._initTimer);
            this._initTimer = undefined;
        }

        if (this._focusOutTimer) {
            win.clearTimeout(this._focusOutTimer);
            this._focusOutTimer = undefined;
        }

        this._tabster.focusedElement.unsubscribe(this._onFocus);

        delete this._curModalizer;
    }

    static dispose(instance: Types.ModalizerAPI): void {
        (instance as ModalizerAPI).dispose();
    }

    add(
        element: HTMLElement,
        basic: Types.ModalizerBasicProps,
        extended?: Types.ModalizerExtendedProps
    ): void {
        const tabsterOnElement = getTabsterOnElement(this._tabster, element);

        if (tabsterOnElement && tabsterOnElement.modalizer) {
            if (__DEV__ && tabsterOnElement.modalizer.userId !== basic.id) {
                console.error(
                    'Element already has Modalizer with different id.',
                    element
                );
            }

            return;
        }

        const modalizer = new Modalizer(
            element,
            this._tabster,
            this._win,
            basic,
            extended
        );

        setTabsterOnElement(this._tabster, element, { modalizer });

        dispatchMutationEvent(element, { modalizer });
    }

    setProps(
        element: HTMLElement,
        basic?: Partial<Types.ModalizerBasicProps> | null,
        extended?: Partial<Types.ModalizerExtendedProps> | null
    ): void {
        const tabsterOnElement = getTabsterOnElement(this._tabster, element);

        if (tabsterOnElement && tabsterOnElement.modalizer) {
            tabsterOnElement.modalizer.setProps(basic, extended);
        }
    }

    remove(element: HTMLElement): void {
        const tabsterOnElement = getTabsterOnElement(this._tabster, element);

        const modalizer = tabsterOnElement && tabsterOnElement.modalizer;

        if (!modalizer) {
            if (__DEV__) {
                console.error('No Modalizer to remove.', element);
            }

            return;
        }

        setTabsterOnElement(this._tabster, element, {
            modalizer: undefined,
        });

        dispatchMutationEvent(element, { modalizer, removed: true });

        modalizer.dispose();
    }

    move(from: HTMLElement, to: HTMLElement): void {
        const tabsterOnElementFrom = getTabsterOnElement(this._tabster, from);

        const modalizer =
            tabsterOnElementFrom && tabsterOnElementFrom.modalizer;

        if (modalizer) {
            modalizer.move(to);

            setTabsterOnElement(this._tabster, to, { modalizer: modalizer });
            setTabsterOnElement(this._tabster, from, { modalizer: undefined });

            dispatchMutationEvent(from, { modalizer, removed: true });
            dispatchMutationEvent(to, { modalizer });
        }
    }

    focus(
        elementFromModalizer: HTMLElement,
        noFocusFirst?: boolean,
        noFocusDefault?: boolean
    ): boolean {
        const ctx = RootAPI.getTabsterContext(
            this._tabster,
            elementFromModalizer
        );

        if (ctx && ctx.modalizer) {
            ctx.root.setCurrentModalizerId(ctx.modalizer.userId);

            const basic = ctx.modalizer.getBasicProps();
            const modalizerElement = ctx.modalizer.getElement();

            if (modalizerElement) {
                if (noFocusFirst === undefined) {
                    noFocusFirst = basic.isNoFocusFirst;
                }

                if (
                    !noFocusFirst &&
                    this._tabster.keyboardNavigation.isNavigatingWithKeyboard() &&
                    this._tabster.focusedElement.focusFirst(modalizerElement)
                ) {
                    return true;
                }

                if (noFocusDefault === undefined) {
                    noFocusDefault = basic.isNoFocusDefault;
                }

                if (
                    !noFocusDefault &&
                    this._tabster.focusedElement.focusDefault(modalizerElement)
                ) {
                    return true;
                }

                this._tabster.focusedElement.resetFocus(modalizerElement);
            }
        } else if (__DEV__) {
            console.error('Element is not in Modalizer.', elementFromModalizer);
        }

        return false;
    }

    private _onFocus = (e: HTMLElement): void => {
        if (this._focusOutTimer) {
            this._win().clearTimeout(this._focusOutTimer);
            this._focusOutTimer = undefined;
        }

        let modalizer: Types.Modalizer | undefined;

        if (e) {
            const ctx = RootAPI.getTabsterContext(this._tabster, e);

            if (ctx) {
                modalizer = ctx.modalizer;
            }
        }

        if (modalizer) {
            if (this._curModalizer && modalizer !== this._curModalizer) {
                this._curModalizer.setFocused(false);
            }

            this._curModalizer = modalizer;

            this._curModalizer.setFocused(true);
        } else if (this._curModalizer) {
            this._focusOutTimer = this._win().setTimeout(() => {
                this._focusOutTimer = undefined;

                if (this._curModalizer) {
                    this._curModalizer.setFocused(false);

                    this._curModalizer = undefined;
                }
            }, 0);
        }
    };
}
