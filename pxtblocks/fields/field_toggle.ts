/// <reference path="../../localtypings/blockly.d.ts" />

namespace pxtblockly {

    export class FieldToggle extends Blockly.FieldNumber implements Blockly.FieldCustom {
        public isFieldCustom_ = true;

        private params: any;

        private state_: boolean;
        private checkElement_: SVGElement;

        private toggleThumb_: SVGElement;

        public CURSOR = 'pointer';

        private type_: string;

        constructor(state: string, params: Blockly.FieldCustomOptions, opt_validator?: Function) {
            super(state, undefined, undefined, undefined, opt_validator);
            this.params = params;
            this.setValue(state);
            this.addArgType('toggle');
            this.type_ = params.type;
        }

        init() {
            if (this.fieldGroup_) {
                // Field has already been initialized once.
                return;
            }
            // Build the DOM.
            this.fieldGroup_ = Blockly.utils.dom.createSvgElement('g', {}, null) as SVGGElement;
            if (!this.visible_) {
                (this.fieldGroup_ as any).style.display = 'none';
            }
            // Add an attribute to cassify the type of field.
            if ((this as any).getArgTypes() !== null) {
                if (this.sourceBlock_.isShadow()) {
                    (this.sourceBlock_ as any).svgGroup_.setAttribute('data-argument-type',
                        (this as any).getArgTypes());
                } else {
                    // Fields without a shadow wrapper, like square dropdowns.
                    this.fieldGroup_.setAttribute('data-argument-type', (this as any).getArgTypes());
                }
            }
            // If not in a shadow block, and has more than one input, draw a box.
            if (!this.sourceBlock_.isShadow()
                && (this.sourceBlock_.inputList && this.sourceBlock_.inputList.length > 1)) {
                this.borderRect_ = Blockly.utils.dom.createSvgElement('rect', {
                    'rx': (Blockly as any).BlockSvg.CORNER_RADIUS,
                    'ry': (Blockly as any).BlockSvg.CORNER_RADIUS,
                    'x': 0,
                    'y': 0,
                    'width': this.size_.width,
                    'height': this.size_.height,
                    'fill': (this.sourceBlock_ as Blockly.BlockSvg).getColour(),
                    'stroke': (this.sourceBlock_ as Blockly.BlockSvg).getColourTertiary()
                }, null) as SVGRectElement;
                this.fieldGroup_.insertBefore(this.borderRect_, this.textElement_);
            }
            // Adjust X to be flipped for RTL. Position is relative to horizontal start of source block.
            const size = this.getSize();
            this.checkElement_ = Blockly.utils.dom.createSvgElement('g',
                {
                    'class': `blocklyToggle ${this.state_ ? 'blocklyToggleOn' : 'blocklyToggleOff'}`,
                    'transform': `translate(8, ${size.height / 2})`,
                }, this.fieldGroup_);
            switch (this.getOutputShape()) {
                case Blockly.OUTPUT_SHAPE_HEXAGONAL:
                    this.toggleThumb_ = Blockly.utils.dom.createSvgElement('polygon',
                        {
                            'class': 'blocklyToggleRect',
                            'points': '-7,-14 -21,0 -7,14 7,14 21,0 7,-14',
                            'cursor': 'pointer'
                        },
                        this.checkElement_);
                    break;
                case Blockly.OUTPUT_SHAPE_ROUND:
                    this.toggleThumb_ = Blockly.utils.dom.createSvgElement('rect',
                        {
                            'class': 'blocklyToggleCircle',
                            'x': -6, 'y': -14, 'height': 28,
                            'width': 28, 'rx': 14, 'ry': 14,
                            'cursor': 'pointer'
                        },
                        this.checkElement_);
                    break;
                case Blockly.OUTPUT_SHAPE_SQUARE:
                    this.toggleThumb_ = Blockly.utils.dom.createSvgElement('rect',
                        {
                            'class': 'blocklyToggleRect',
                            'x': -6, 'y': -14, 'height': 28,
                            'width': 28, 'rx': 3, 'ry': 3,
                            'cursor': 'pointer'
                        },
                        this.checkElement_);
                    break;
            }

            let fieldX = (this.sourceBlock_.RTL) ? -size.width / 2 : size.width / 2;
            /** @type {!Element} */
            this.textElement_ = Blockly.utils.dom.createSvgElement('text',
                {
                    'class': 'blocklyText',
                    'x': fieldX,
                    'dy': '0.6ex',
                    'y': size.height / 2
                },
                this.fieldGroup_) as SVGTextElement;

            this.updateEditable();
            const svgRoot = (this.sourceBlock_ as Blockly.BlockSvg).getSvgRoot();
            svgRoot.appendChild(this.fieldGroup_);
            svgRoot.querySelector(".blocklyBlockBackground").setAttribute('fill', (this.sourceBlock_ as Blockly.BlockSvg).getColourTertiary())

            this.switchToggle(this.state_);
            this.setValue(this.getValue());

            // Force a render.
            this.render_();
            this.size_.width = 0;
            (this as any).mouseDownWrapper_ =
                Blockly.bindEventWithChecks_((this as any).getClickTarget_(), 'mousedown', this,
                    (this as any).onMouseDown_);
        }

        getDisplayText_() {
            return this.state_ ? this.getTrueText() : this.getFalseText();
        }

        getTrueText() {
            return lf("True");
        }

        getFalseText() {
            return lf("False");
        }

        updateSize_() {
            switch (this.getOutputShape()) {
                case Blockly.OUTPUT_SHAPE_ROUND:
                    this.size_.width = this.getInnerWidth() * 2 - 7; break;
                case Blockly.OUTPUT_SHAPE_HEXAGONAL:
                    this.size_.width = this.getInnerWidth() * 2 + 8 - Math.floor(this.getInnerWidth() / 2); break;
                case Blockly.OUTPUT_SHAPE_SQUARE:
                    this.size_.width = 9 + this.getInnerWidth() * 2; break;
            }
        }

        getInnerWidth() {
            return this.getMaxLength() * 10;
        }

        getMaxLength() {
            return Math.max(this.getTrueText().length, this.getFalseText().length);
        }

        getOutputShape() {
            return this.sourceBlock_.isShadow() ? this.sourceBlock_.getOutputShape() : Blockly.OUTPUT_SHAPE_SQUARE;
        }

        doClassValidation_(newBool: string) {
            return typeof this.fromVal(newBool) == "boolean" ? newBool : "false";
        }

        applyColour() {
            let color = (this.sourceBlock_ as Blockly.BlockSvg).getColourTertiary();
            if (this.borderRect_) {
                this.borderRect_.setAttribute('stroke', color);
            } else {
                (this.sourceBlock_ as any).pathObject.svgPath.setAttribute('fill', color);
            }
        };

        /**
         * Return 'TRUE' if the toggle is ON, 'FALSE' otherwise.
         * @return {string} Current state.
         */
        getValue() {
            return this.toVal(this.state_);
        };

        /**
         * Set the checkbox to be checked if newBool is 'TRUE' or true,
         * unchecks otherwise.
         * @param {string|boolean} newBool New state.
         */
        doValueUpdate_(newBool: string) {
            let newState = this.fromVal(newBool);
            if (this.state_ !== newState) {
                if (this.sourceBlock_ && Blockly.Events.isEnabled()) {
                    Blockly.Events.fire(new (Blockly.Events as any).BlockChange(
                        this.sourceBlock_, 'field', this.name, this.state_, newState));
                }
                this.state_ = newState;

                this.switchToggle(this.state_);
                this.isDirty_ = true;
            }
        }

        switchToggle(newState: boolean) {
            if (this.checkElement_) {
                this.updateSize_();
                const size = this.getSize();
                const innerWidth = this.getInnerWidth();
                if (newState) {
                    pxt.BrowserUtils.addClass(this.checkElement_, 'blocklyToggleOn');
                    pxt.BrowserUtils.removeClass(this.checkElement_, 'blocklyToggleOff');
                } else {
                    pxt.BrowserUtils.removeClass(this.checkElement_, 'blocklyToggleOn');
                    pxt.BrowserUtils.addClass(this.checkElement_, 'blocklyToggleOff');
                }
                const outputShape = this.getOutputShape();
                let width = 0, halfWidth = 0;
                let leftPadding = 0, rightPadding = 0;
                switch (outputShape) {
                    case Blockly.OUTPUT_SHAPE_HEXAGONAL:
                        width = innerWidth;
                        halfWidth = width / 2;
                        let quarterWidth = halfWidth / 2;
                        // TODO: the left padding calculation is a hack, we should calculate left padding based on width (generic case)
                        leftPadding = this.getMaxLength() > 3 ? -10 : 1;
                        rightPadding = -quarterWidth;
                        const topLeftPoint = -quarterWidth;
                        const bottomRightPoint = halfWidth;
                        this.toggleThumb_.setAttribute('points', `${topLeftPoint},-14 ${topLeftPoint - 14},0 ${topLeftPoint},14 ${bottomRightPoint},14 ${bottomRightPoint + 14},0 ${bottomRightPoint},-14`);
                        break;
                    case Blockly.OUTPUT_SHAPE_ROUND:
                    case Blockly.OUTPUT_SHAPE_SQUARE:
                        width = 5 + innerWidth;
                        halfWidth = width / 2;
                        this.toggleThumb_.setAttribute('width', "" + width);
                        this.toggleThumb_.setAttribute('x', `-${halfWidth}`);
                        leftPadding = rightPadding = outputShape == Blockly.OUTPUT_SHAPE_SQUARE ? 2 : -6;
                        break;
                }
                this.checkElement_.setAttribute('transform', `translate(${newState ? rightPadding + innerWidth + halfWidth : halfWidth + leftPadding}, ${size.height / 2})`);
            }
        }

        render_() {
            if (this.visible_ && this.textElement_) {
                // Replace the text.
                goog.dom.removeChildren(/** @type {!Element} */(this.textElement_));
                let textNode = document.createTextNode(this.getDisplayText_());
                this.textElement_.appendChild(textNode);
                pxt.BrowserUtils.addClass(this.textElement_ as SVGElement, 'blocklyToggleText');
                this.updateSize_();

                // Update text centering, based on newly calculated width.
                let width = this.size_.width;
                let centerTextX = this.state_ ? (width + width / 8) : width / 2;

                // Apply new text element x position.
                let newX = centerTextX - width / 2;
                this.textElement_.setAttribute('x', `${newX}`);
            }

            // Update any drawn box to the correct width and height.
            if (this.borderRect_) {
                this.borderRect_.setAttribute('width', `${this.size_.width}`);
                this.borderRect_.setAttribute('height', `${this.size_.height}`);
            }
        }

        /**
         * Toggle the state of the toggle.
         * @private
         */
        showEditor_() {
            let newState = !this.state_;
            /*
            if (this.sourceBlock_) {
              // Call any validation function, and allow it to override.
              newState = this.callValidator(newState);
            }*/
            if (newState !== null) {
                this.setValue(this.toVal(newState));
            }
        }

        private toVal(newState: boolean): string {
            if (this.type_ == "number") return String(newState ? '1' : '0');
            else return String(newState ? 'true' : 'false');
        }

        private fromVal(val: string): boolean {
            if (typeof val == "string") {
                if (val == "1" || val.toUpperCase() == "TRUE") return true;
                return false;
            }
            return !!val;
        }
    }
}