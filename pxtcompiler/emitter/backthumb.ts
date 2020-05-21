// Make sure backbase.ts is loaded before us, otherwise 'extends AssemblerSnippets' fails at runtime
/// <reference path="backbase.ts"/>

namespace ts.pxtc {

    export const thumbCmpMap: pxt.Map<string> = {
        "numops::lt": "_cmp_lt",
        "numops::gt": "_cmp_gt",
        "numops::le": "_cmp_le",
        "numops::ge": "_cmp_ge",
        "numops::eq": "_cmp_eq",
        "numops::eqq": "_cmp_eqq",
        "numops::neq": "_cmp_neq",
        "numops::neqq": "_cmp_neqq",
    }

    const inlineArithmetic: pxt.Map<string> = {
        "numops::adds": "_numops_adds",
        "numops::subs": "_numops_subs",
        "numops::orrs": "_numops_orrs",
        "numops::eors": "_numops_eors",
        "numops::ands": "_numops_ands",
        "numops::lsls": "_numops_lsls",
        "numops::asrs": "_numops_asrs",
        "numops::lsrs": "_numops_lsrs",
        "pxt::toInt": "_numops_toInt",
        "pxt::fromInt": "_numops_fromInt",
    }

    // snippets for ARM Thumb assembly
    export class ThumbSnippets extends AssemblerSnippets {
        stackAligned() {
            return target.stackAlign && target.stackAlign > 1
        }
        pushLR() {
            // r5 should contain GC-able value
            if (this.stackAligned()) return "push {lr, r5}  ; r5 for align"
            else return "push {lr}"
        }
        popPC() {
            if (this.stackAligned()) return "pop {pc, r5}  ; r5 for align"
            else return "pop {pc}"
        }
        nop() { return "nop" }
        mov(trg: string, dst: string) {
            return `mov ${trg}, ${dst}`
        }
        helper_ret() {
            return `bx r4`
        }
        reg_gets_imm(reg: string, imm: number) {
            return `movs ${reg}, #${imm}`
        }
        push_fixed(regs: string[]) { return "push {" + regs.join(", ") + "}" }
        pop_fixed(regs: string[]) { return "pop {" + regs.join(", ") + "}" }
        proc_setup(numlocals: number, main?: boolean) {
            let r = ""
            if (numlocals > 0) {
                r += "    movs r0, #0\n"
                for (let i = 0; i < numlocals; ++i)
                    r += "    push {r0} ;loc\n"
            }
            return r
        }
        proc_return() { return "pop {pc}" }

        debugger_stmt(lbl: string) {
            oops()
            return `
    @stackempty locals
    ldr r0, [r6, #0] ; debugger
    subs r0, r0, #4  ; debugger
${lbl}:
    ldr r0, [r0, #0] ; debugger
`
        }

        debugger_bkpt(lbl: string) {
            oops()
            return `
    @stackempty locals
    ldr r0, [r6, #0] ; brk
${lbl}:
    ldr r0, [r0, #0] ; brk
`
        }

        debugger_proc(lbl: string) {
            oops()
            return `
    ldr r0, [r6, #0]  ; brk-entry
    ldr r0, [r0, #4]  ; brk-entry
${lbl}:`
        }

        push_local(reg: string) { return `push {${reg}}` }
        push_locals(n: number) { return `sub sp, #4*${n} ; push locals ${n} (align)` }
        pop_locals(n: number) { return `add sp, #4*${n} ; pop locals ${n}` }
        unconditional_branch(lbl: string) { return "bb " + lbl; }
        beq(lbl: string) { return "beq " + lbl }
        bne(lbl: string) { return "bne " + lbl }
        cmp(reg1: string, reg2: string) { return "cmp " + reg1 + ", " + reg2 }
        cmp_zero(reg1: string) { return "cmp " + reg1 + ", #0" }
        load_reg_src_off(reg: string, src: string, off: string, word?: boolean, store?: boolean, inf?: BitSizeInfo) {
            off = off.replace(/:\d+$/, "")
            if (word) {
                off = `#4*${off}`
            }
            let str = "str"
            let ldr = "ldr"
            if (inf) {
                if (inf.immLimit == 32)
                    str = "strb"
                else if (inf.immLimit == 64)
                    str = "strh"
                if (inf.needsSignExt)
                    ldr = str.replace("str", "ldrs")
                else
                    ldr = str.replace("str", "ldr")
            }
            if (store)
                return `${str} ${reg}, [${src}, ${off}]`
            else
                return `${ldr} ${reg}, [${src}, ${off}]`
        }
        rt_call(name: string, r0: string, r1: string) {
            return name + " " + r0 + ", " + r1;
        }
        alignedCall(lbl: string, stackAlign: number) {
            if (stackAlign)
                return `${this.push_locals(stackAlign)}\nbl ${lbl}\n${this.pop_locals(stackAlign)}`
            else
                return "bl " + lbl;
        }
        call_lbl(lbl: string, saveStack?: boolean, stackAlign?: number) {
            let o = U.lookup(inlineArithmetic, lbl)
            if (o) {
                lbl = o
                saveStack = false
            }
            if (!saveStack && lbl.indexOf("::") > 0)
                saveStack = true
            if (saveStack)
                return this.callCPP(lbl, stackAlign)
            else
                return this.alignedCall(lbl, stackAlign)
        }
        call_reg(reg: string) {
            return "blx " + reg;
        }
        helper_prologue() {
            return `
    @stackmark args
    ${this.pushLR()}
`;
        }
        helper_epilogue() {
            return `
    ${this.popPC()}
    @stackempty args
`
        }
        load_ptr_full(lbl: string, reg: string) {
            assert(!!lbl)
            return `
    ldlit ${reg}, ${lbl}
`
        }

        load_vtable(trg: string, src: string) {
            return `ldr ${trg}, [${src}, #0]`
        }

        lambda_init() {
            return `
    mov r5, r0
    mov r4, lr
    bl pxtrt::getGlobalsPtr
    mov r6, r0
    bx r4
`
        }

        saveThreadStack() {
            return "mov r7, sp\n    str r7, [r6, #4]\n"
        }

        restoreThreadStack() {
            if (target.switches.gcDebug)
                return "movs r7, #0\n    str r7, [r6, #4]\n"
            else
                return ""
        }

        callCPPPush(lbl: string) {
            return this.pushLR() + "\n" + this.callCPP(lbl) + "\n" + this.popPC() + "\n"
        }

        callCPP(lbl: string, stackAlign?: number) {
            return this.saveThreadStack() + this.alignedCall(lbl, stackAlign) + "\n" + this.restoreThreadStack()
        }

        inline_decr(idx: number) {
            // TODO optimize sequences of pops without decr into sub on sp
            return `
    lsls r1, r0, #30
    bne .tag${idx}
    bl _pxt_decr
.tag${idx}:
`
        }

        arithmetic() {
            let r = ""

            const boxedOp = (op: string) => {
                let r = ".boxed:\n"
                r += `
                    ${this.pushLR()}
                    push {r0, r1}
                    ${this.saveThreadStack()}
                    ${op}
                    ${this.restoreThreadStack()}
                    add sp, #8
                    ${this.popPC()}
                `
                return r
            }

            const checkInts = (op: string) => {
                r += `
_numops_${op}:
    @scope _numops_${op}
    lsls r2, r0, #31
    beq .boxed
    lsls r2, r1, #31
    beq .boxed
`
            }

            const finishOp = (op: string) => {
                r += `    blx lr\n`
                r += boxedOp(`bl numops::${op}`)
            }

            for (let op of ["adds", "subs"]) {
                checkInts(op)
                r += `
    subs r2, r1, #1
    ${op} r2, r0, r2
    bvs .boxed
    movs r0, r2
`
                finishOp(op)
            }

            for (let op of ["ands", "orrs", "eors"]) {
                checkInts(op)
                r += `    ${op} r0, r1\n`
                if (op == "eors")
                    r += `    adds r0, r0, #1\n`
                finishOp(op)
            }

            for (let op of ["lsls", "lsrs", "asrs"]) {
                checkInts(op)
                r += `
    ; r3 := (r1 >> 1) & 0x1f
    lsls r3, r1, #26
    lsrs r3, r3, #27
`
                if (op == "asrs")
                    r += `
    asrs r0, r3
    movs r2, #1
    orrs r0, r2
`
                else {
                    if (op == "lsrs")
                        r += `
    asrs r2, r0, #1
    lsrs r2, r3
    lsrs r3, r2, #30
    bne .boxed
`
                    else
                        r += `
    asrs r2, r0, #1
    lsls r2, r3
    lsrs r3, r2, #30
    beq .ok
    cmp r3, #3
    bne .boxed
.ok:
`
                    r += `
    lsls r0, r2, #1
    adds r0, r0, #1
`
                }

                finishOp(op)
            }



            r += `
@scope _numops_toInt
_numops_toInt:
    asrs r0, r0, #1
    bcc .over
    blx lr
.over:
    lsls r0, r0, #1
    ${this.callCPPPush("pxt::toInt")}

_numops_fromInt:
    lsls r2, r0, #1
    asrs r1, r2, #1
    cmp r0, r1
    bne .over2
    adds r0, r2, #1
    blx lr
.over2:
    ${this.callCPPPush("pxt::fromInt")}
`


            for (let op of Object.keys(thumbCmpMap)) {
                op = op.replace(/.*::/, "")
                // this make sure to set the Z flag correctly
                r += `
.section code
_cmp_${op}:
    lsls r2, r0, #31
    beq .boxed
    lsls r2, r1, #31
    beq .boxed
    subs r0, r1
    b${op.replace("qq", "q").replace("neq", "ne")} .true
.false:
    movs r0, #0
    bx lr
.true:
    movs r0, #1
    bx lr
`
                // the cmp isn't really needed, given how toBoolDecr() is compiled,
                // but better not rely on it
                // Also, cmp isn't needed when ref-counting (it ends with movs r0, r4)
                r += boxedOp(`
                        bl numops::${op}
                        bl numops::toBoolDecr
                        cmp r0, #0`)
            }

            return r
        }

        emit_int(v: number, reg: string) {
            let movWritten = false

            function writeMov(v: number) {
                assert(0 <= v && v <= 255)
                let result = ""
                if (movWritten) {
                    if (v)
                        result = `adds ${reg}, #${v}\n`
                } else
                    result = `movs ${reg}, #${v}\n`
                movWritten = true
                return result
            }

            function shift(v = 8) {
                return `lsls ${reg}, ${reg}, #${v}\n`
            }

            assert(v != null);

            let n = Math.floor(v)
            let isNeg = false
            if (n < 0) {
                isNeg = true
                n = -n
            }

            // compute number of lower-order 0s and shift that amount
            let numShift = 0
            if (n > 0xff) {
                let shifted = n
                while ((shifted & 1) == 0) {
                    shifted >>>= 1
                    numShift++
                }
                if (numBytes(shifted) < numBytes(n)) {
                    n = shifted
                } else {
                    numShift = 0
                }
            }

            let result = ""
            switch (numBytes(n)) {
                case 4:
                    result += writeMov((n >>> 24) & 0xff)
                    result += shift()
                case 3:
                    result += writeMov((n >>> 16) & 0xff)
                    result += shift()
                case 2:
                    result += writeMov((n >>> 8) & 0xff)
                    result += shift()
                case 1:
                    result += writeMov(n & 0xff)
                    break
                default:
                    oops()
            }

            if (numShift)
                result += shift(numShift)

            if (isNeg) {
                result += `negs ${reg}, ${reg}\n`
            }

            if (result.split("\n").length > 3 + 1) {
                // more than 3 instructions? replace with LDR at PC-relative address
                return `ldlit ${reg}, ${Math.floor(v)}\n`
            }

            return result
        }
    }
}

