import cx from 'classnames';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import {
    // Units
    IMPERIAL_UNITS,
    METRIC_UNITS,
    // Controllers
    GRBL
} from '../../constants';
import controller from '../../lib/controller';
import log from '../../lib/log';

class App extends PureComponent {
    static propTypes = {
        state: PropTypes.object,
        actions: PropTypes.object
    };

    state = this.getInitialState();

    actions = {
        onChangeMargin: (event) => {
            this.setState({ margin: event.value });
        },

        onChangeZSafe: (event) => {
            this.setState({ zSafe: event.value });
        },

        onChangeDelta: (event) => {
            this.setState({ delta: event.value });
        },

        onChangeFeedrate: (event) => {
            this.setState({ feedrate: event.value });
        }
    }

    controllerEvent = {
        'gcode:load': (name, gcode) => {
            // Tiny gcode parser to calculate bounding box.
            // If this ext gets integrated to cncjs use `gcode:bbox` pubsub event
            // TODO: Ask if mesh should be deleted

            let xmin = null;
            let xmax = null;
            let ymin = null;
            let ymax = null;

            gcode.split('\n').forEach(line => {
                if (line[0] !== 'G') {
                    return;
                }

                let cmd = parseInt(line.substr(1, 2), 10);
                if (cmd !== 0 && cmd !== 1 && cmd !== 2 && cmd !== 3 && cmd !== 38) {
                    return;
                }

                let parser = /(?:\s?([XY]-?[0-9.]+)+)/g;

                for (const matchGroups of [...line.matchAll(parser)]) {
                    const match = matchGroups[1];
                    let num = parseFloat(match.substr(1));
                    if (match[0] === 'X') {
                        if (num > xmax || xmax === null) {
                            xmax = num;
                        }
                        if (num < xmin || xmin === null) {
                            xmin = num;
                        }
                    } else if (match[0] === 'Y') {
                        if (num > ymax || ymax === null) {
                            ymax = num;
                        }
                        if (num < ymin || ymin === null) {
                            ymin = num;
                        }
                    }
                }
            });

            // TODO: Show it in the UI
            log.info(`New BBox: xmin: ${xmin} xmax: ${xmax} ymin: ${ymin} ymax: ${ymax}`);
            this.setState({
                bbox: {
                    min: { x: xmin, y: ymin },
                    max: { x: xmax, y: ymax }
                },
                // TODO: Make these configurable
                alignmentHole: [
                    { x: xmin - 1, y: ymax / 2 },
                    { x: xmax + 1, y: ymax / 2 }
                ]
            });
            log.info(`New Alignment Holes: left X ${this.state.alignmentHole[0].x} Y ${this.state.alignmentHole[0].y} right X ${this.state.alignmentHole[0].x} Y ${this.state.alignmentHole[0].y}`);
            this.setState({ gcodeLoaded: true });
        },
        'gcode:unload': () => {
            this.setState({ gcodeLoaded: false });
        },
        'serialport:open': (options) => {
            const { port } = options;
            this.setState({ port: port });
        },
        // TODO: Intercept all writes and autolevel them
        'serialport:write': (data, ctx) => {
            console.log(data, ctx);
            return 'a';
        },
        'serialport:close': (options) => {
            const initialState = this.getInitialState();
            this.setState({ ...initialState });
        },
        'parameters': () => {
            console.log(`parameters! ${arguments}`);
        },
        'workflow:state': (state, context) => {
            this.setState({
                workflow: {
                    state: state,
                    context: context
                }
            });
        },
        'controller:state': (controllerType, controllerState) => {
            this.setState(state => ({
                controller: {
                    ...state.controller,
                    type: controllerType,
                    state: controllerState
                }
            }));

            if (controllerType === GRBL) {
                const {
                    status: { mpos, wpos, wco },
                    parserstate: { modal = {} }
                } = controllerState;

                // Units
                const units = {
                    'G20': IMPERIAL_UNITS,
                    'G21': METRIC_UNITS
                }[modal.units] || this.state.units;

                this.setState(state => ({
                    units: units,
                    machinePosition: { // Reported in mm ($13=0) or inches ($13=1)
                        ...state.machinePosition,
                        ...mpos
                    },
                    workPosition: { // Reported in mm ($13=0) or inches ($13=1)
                        ...state.workPosition,
                        ...wpos
                    },
                    wco: wco
                }));
            }
        },
        'controller:settings': (controllerType, controllerSettings) => {
            this.setState(state => ({
                controller: {
                    ...state.controller,
                    type: controllerType,
                    settings: controllerSettings
                }
            }));
        },
        'serialport:read': (data) => {
        }
    };

    componentDidMount() {
        this.addControllerEvents();
    }

    componentWillUnmount() {
        this.removeControllerEvents();
    }

    addControllerEvents() {
        Object.keys(this.controllerEvent).forEach(eventName => {
            const callback = this.controllerEvent[eventName];
            controller.addListener(eventName, callback);
        });
    }

    removeControllerEvents() {
        Object.keys(this.controllerEvent).forEach(eventName => {
            const callback = this.controllerEvent[eventName];
            controller.removeListener(eventName, callback);
        });
    }

    getInitialState() {
        return {
            port: controller.port,
            units: METRIC_UNITS,
            controller: {
                type: controller.type,
                state: controller.state
            },
            workflow: {
                state: controller.workflow.state,
                context: controller.workflow.context
            },
            machinePosition: {
                x: 0.000,
                y: 0.000,
                z: 0.000
            },
            workPosition: {
                x: 0.000,
                y: 0.000,
                z: 0.000
            },
            wco: {
                x: 0.000,
                y: 0.000,
                z: 0.000
            },
            bbox: {
                min: {
                    x: 0,
                    y: 0
                },
                max: {
                    x: 0,
                    y: 0
                }
            },
            // TODO: Do something with it
            alignmentHole: [
                { x: null, y: null },
                { x: null, y: null }
            ],
            isAutolevelRunning: false,
            delta: 10.0,
            zSafe: 3.0,
            feedrate: 25,
            margin: 2.5,
            gcodeLoaded: false,

            plannedPointCount: 0,
            probedPoints: []
        };
    }

    render() {
        const {
            isAutolevelRunning,
            margin,
            zSafe,
            delta,
            feedrate
        } = this.state;

        return (
            <div className="form-group">
                <div className="input-group input-group-sm">
                    <label className="control-label">Margins</label>
                    <input
                        type="number"
                        className="form-control"
                        step="0.5"
                        min="0"
                        defaultValue={margin}
                        disabled={isAutolevelRunning}
                        onChange={this.actions.onChangeMargin}
                    />
                    <label className="control-label">Z Safe</label>
                    <input
                        type="number"
                        className="form-control"
                        step="0.5"
                        min="0.5"
                        defaultValue={zSafe}
                        disabled={isAutolevelRunning}
                        onChange={this.actions.onChangeZSafe}
                    />
                    <label className="control-label">Delta</label>
                    <input
                        type="number"
                        className="form-control"
                        step="1"
                        min="1"
                        defaultValue={delta}
                        disabled={isAutolevelRunning}
                        onChange={this.actions.onChangeDelta}
                    />
                    <label className="control-label">Feedrate</label>
                    <input
                        type="number"
                        className="form-control"
                        step="10"
                        min="1"
                        defaultValue={feedrate}
                        disabled={isAutolevelRunning}
                        onChange={this.actions.onChangeFeedrate}
                    />

                    <hr />
                    Alignment hole left: {this.state.alignmentHole[0].x}, {this.state.alignmentHole[0].y}
                    Alignment hole right: {this.state.alignmentHole[1].x}, {this.state.alignmentHole[1].y}
                </div>
                <div className="input-group input-group-sm">
                    <div className="input-group-btn">
                        <button
                            type="button"
                            className={cx(
                                'btn',
                                'btn-primary'
                            )}
                            disabled={isAutolevelRunning}
                            onClick={() => {
                                this.startAutolevel();
                            }}
                        >Run Autolevel</button>
                    </div>
                </div>
            </div>
        );
    }

    eventAutolevelingProber(data) {
        // TODO: Return a promise? or at the "start level" thing?

        if (this.state.isAutolevelRunning && this.state.plannedPointCount <= this.state.probedPoints.length) {
            this.setState({ isAutolevelRunning: false });
            return;
        }

        if (!this.state.isAutolevelRunning || this.state.plannedPointCount <= this.state.probedPoints.length || data.indexOf('PRB') < 0) {
            return;
        }

        // TODO: Add support for the rest of the controllers
        let prbm = /\[PRB:([\+\-\.\d]+),([\+\-\.\d]+),([\+\-\.\d]+),?([\+\-\.\d]+)?:(\d)\]/g.exec(data);
        if (!prbm) {
            return;
        }

        console.log(`read! ${JSON.stringify(data)}`);

        let prb = [
            parseFloat(prbm[1]),
            parseFloat(prbm[2]),
            parseFloat(prbm[3])
        ];
        let pt = {
            x: prb[0] - this.state.controller.state.wco.x,
            y: prb[1] - this.state.controller.state.wco.y,
            z: prb[2] - this.state.controller.state.wco.z
        };

        if (this.state.plannedPointCount <= 0) {
            return;
        }

        if (this.state.probedPoints.length === 0) {
            this.min_dz = pt.z;
            this.max_dz = pt.z;
            this.sum_dz = pt.z;
        } else {
            if (pt.z < this.min_dz) {
                this.min_dz = pt.z;
            }
            if (pt.z > this.max_dz) {
                this.max_dz = pt.z;
            }
            this.sum_dz += pt.z;
        }

        this.state.probedPoints.push(pt);
        log.info(`Probed ${this.state.probedPoints.length}/${this.state.plannedPointCount}> ${pt.x.toFixed(3)} ${pt.y.toFixed(3)} ${pt.z.toFixed(3)}`);
        controller.removeListener('serialport:read', this.eventAutolevelingProber);
        // send info to console
        if (this.state.probedPoints.length >= this.state.plannedPointCount) {
            this.applyCompensation();
            this.setState({ plannedPointCount: 0 });
        }
    }

    probeAlignmentHole(index) {
        let code = [];
        const x = this.state.alignmentHole[index].x;
        const y = this.state.alignmentHole[index].y;

        log.info(`Probing hole ${index}`);
        code.push('G21');
        code.push('G90');
        code.push(`G0 X${x} Y${y}`);
        code.push(`G38.2 Z-${this.state.zSafe} F${this.state.feedrate / 2}`);
        code.push(`G0 X${x} Y${y}`);
        code.push('G10 L20 P1 Z0');
        code.push('G0 Z1');

        // TODO: Throw a box with the G-code in it for confirmation like probe
        controller.command('gcode', code.join('\n'));
    }

    makeAlignmentHole(index) {
        let code = [];
        code.push(`G1 Z-1.6 F${this.state.feedrate}`);

        // TODO: Throw a box with the G-code in it for confirmation like probe
        controller.command('gcode', code.join('\n'));
    }

    // TODO: Add function to clear current probes
    startAutolevel() {
        // Code got from https://github.com/kreso-t/cncjs-kt-ext
        log.info('Starting autoleveling');
        this.setState({ isAutolevelRunning: true });

        // let workCoordinates = {
        //     x: this.state.machinePosition.x - this.state.workPosition.x,
        //     y: this.state.machinePosition.y - this.state.workPosition.y,
        //     z: this.state.machinePosition.z - this.state.workPosition.z
        // };
        let plannedPointCount = 0;

        let code = [];
        let xmin = this.state.bbox.min.x - this.state.margin;
        let xmax = this.state.bbox.max.x + this.state.margin;
        let ymin = this.state.bbox.min.y - this.state.margin;
        let ymax = this.state.bbox.max.y + this.state.margin;

        let dx = (xmax - xmin) / parseInt((xmax - xmin) / this.state.delta, 10);
        let dy = (ymax - ymin) / parseInt((ymax - ymin) / this.state.delta, 10);
        // TODO: Use the `controller` to send motion/whatever commands
        // like the Probe widget:
        // https://github.com/cncjs/cncjs/blob/6f2ec1574eace3c99b4a18c3de199b222524d0e1/src/app/widgets/Probe/index.jsx#L132
        code.push('G21');
        code.push('G90');
        code.push(`G0 Z${this.state.zSafe}`);
        code.push(`G0 X${xmin.toFixed(3)} Y${ymin.toFixed(3)} Z${this.state.zSafe}`);
        code.push(`G38.2 Z-${this.state.zSafe + 1} F${this.state.feedrate / 2}`);
        code.push('G10 L20 P1 Z0'); // set the z zero
        code.push(`G0 Z${this.state.zSafe}`);
        plannedPointCount++;

        let y = ymin - dy;

        while (y < ymax - 0.01) {
            y += dy;
            if (y > ymax) {
                y = ymax;
            }

            let x = xmin - dx;
            if (y <= ymin + 0.01) {
                // don't probe first point twice
                x = xmin;
            }

            while (x < xmax - 0.01) {
                x += dx;
                if (x > xmax) {
                    x = xmax;
                }
                code.push(`G90 G0 X${x.toFixed(3)} Y${y.toFixed(3)} Z${this.state.zSafe}`);
                code.push(`G38.2 Z-${this.state.zSafe + 1} F${this.state.feedrate}`);
                code.push(`G0 Z${this.state.zSafe}`);
                plannedPointCount++;
            }
        }

        this.setState({ plannedPointCount, probedPoints: [] });

        log.info(`Sending GCode:\n${code.join('\n')}\n`);
        // TODO: Throw a box with the G-code in it for confirmation like probe
        controller.command('gcode', code.join('\n'));
        controller.addListener('serialport:read', this.eventAutolevelingProber);
    }

    applyCompensation(gcode) {
        log.info('Applying compensation');

        let lines = gcode.split('\n');
        let p0 = {
            x: 0,
            y: 0,
            z: 0
        };
        let p0Initialized = false;
        let pt = {
            x: 0,
            y: 0,
            z: 0
        };

        let abs = true;
        let units = METRIC_UNITS;
        let result = [];
        lines.forEach(line => {
            let lineStripped = this.stripComments(line);
            if (/(G38.+|G5.+|G10|G4.+|G92|G92.1)/gi.test(lineStripped)) {
                // skip compensation for these G-Codes
                result.push(lineStripped);
            } else {
                if (/G91/i.test(lineStripped)) {
                    abs = false;
                }
                if (/G90/i.test(lineStripped)) {
                    abs = true;
                }
                if (/G20/i.test(lineStripped)) {
                    units = IMPERIAL_UNITS;
                }
                if (/G21/i.test(lineStripped)) {
                    units = METRIC_UNITS;
                }

                if (!/(X|Y|Z)/gi.test(lineStripped)) {
                    result.push(lineStripped); // no coordinate change --> copy to output
                } else {
                    let xMatch = /X([\.\+\-\d]+)/gi.exec(lineStripped);
                    if (xMatch) {
                        pt.x = parseFloat(xMatch[1]);
                    }

                    let yMatch = /Y([\.\+\-\d]+)/gi.exec(lineStripped);
                    if (yMatch) {
                        pt.y = parseFloat(yMatch[1]);
                    }

                    let zMatch = /Z([\.\+\-\d]+)/gi.exec(lineStripped);
                    if (zMatch) {
                        pt.z = parseFloat(zMatch[1]);
                    }

                    if (abs) {
                        // strip coordinates
                        lineStripped = lineStripped.replace(/([XYZ])([\.\+\-\d]+)/gi, '');
                        if (p0Initialized) {
                            let segs = this.splitToSegments(p0, pt);
                            for (let seg of segs) {
                                let cpt = this.compensateZCoord(seg, units);
                                let newLine = lineStripped + ` X${cpt.x.toFixed(3)} Y${cpt.y.toFixed(3)} Z${cpt.z.toFixed(3)} ; Z${seg.z.toFixed(3)}`;
                                result.push(newLine.trim());
                            }
                        } else {
                            let cpt = this.compensateZCoord(pt, units);
                            let newLine = lineStripped + ` X${cpt.x.toFixed(3)} Y${cpt.y.toFixed(3)} Z${cpt.z.toFixed(3)} ; Z${pt.z.toFixed(3)}`;
                            result.push(newLine.trim());
                            p0Initialized = true;
                        }
                    } else {
                        result.push(lineStripped);
                        console.log('WARNING: using relative mode may not produce correct results');
                    }
                    p0 = {
                        x: pt.x,
                        y: pt.y,
                        z: pt.z
                    }; // clone
                }
            }
        });

        const newGcodeFileName = '#AL:' + this.gcodeFileName;
        controller.command('gcode:load', newGcodeFileName, result.join('\n'));
        return result.join('\n');
    }

    stripComments(line) {
        const re1 = new RegExp(/\s*\([^\)]*\)/g); // Remove anything inside the parentheses
        const re2 = new RegExp(/\s*;.*/g); // Remove anything after a semi-colon to the end of the line, including preceding spaces
        const re3 = new RegExp(/\s+/g);
        return (line.replace(re1, '').replace(re2, '').replace(re3, ''));
    }

    distanceSquared3(p1, p2) {
        return (p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y) + (p2.z - p1.z) * (p2.z - p1.z);
    }

    distanceSquared2(p1, p2) {
        return (p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y);
    }

    crossProduct3(u, v) {
        return {
            x: (u.y * v.z - u.z * v.y),
            y: -(u.x * v.z - u.z * v.x),
            z: (u.x * v.y - u.y * v.x)
        };
    }

    isColinear(u, v) {
        return Math.abs(u.x * v.y - u.y * v.x) < 0.00001;
    }

    sub3(p1, p2) {
        return {
            x: p1.x - p2.x,
            y: p1.y - p2.y,
            z: p1.z - p2.z
        };
    }

    formatPt(pt) {
        return `(x:${pt.x.toFixed(3)} y:${pt.y.toFixed(3)} z:${pt.z.toFixed(3)})`;
    }

    splitToSegments(p1, p2, units) {
        let res = [];
        let v = this.sub3(p2, p1); // delta
        let dist = Math.sqrt(this.distanceSquared3(p1, p2)); // distance
        let dir = {
            x: v.x / dist,
            y: v.y / dist,
            z: v.z / dist
        }; // direction vector
        let maxSegLength = this.convertUnits(this.delta, METRIC_UNITS, units) / 2;
        res.push({
            x: p1.x,
            y: p1.y,
            z: p1.z
        }); // first point
        for (let d = maxSegLength; d < dist; d += maxSegLength) {
            res.push({
                x: p1.x + dir.x * d,
                y: p1.y + dir.y * d,
                z: p1.z + dir.z * d
            }); // split points
        }
        res.push({
            x: p2.x,
            y: p2.y,
            z: p2.z
        }); // last point
        return res;
    }

    // Argument is assumed to be in millimeters.
    getThreeClosestPoints(pt) {
        let res = [];
        if (this.state.probedPoints.length < 3) {
            return res;
        }
        this.state.probedPoints.sort((a, b) => {
            return this.distanceSquared2(a, pt) < this.distanceSquared2(b, pt) ? -1 : 1;
        });
        let i = 0;
        while (res.length < 3 && i < this.state.probedPoints.length) {
            if (res.length === 2) {
                // make sure points are not colinear
                if (!this.isColinear(this.sub3(res[1], res[0]), this.sub3(this.state.probedPoints[i], res[0]))) {
                    res.push(this.state.probedPoints[i]);
                }
            } else {
                res.push(this.state.probedPoints[i]);
            }

            i++;
        }
        return res;
    }

    compensateZCoord(PtInOrMM, inputUnits) {
        let ptMM = {
            x: this.convertUnits(PtInOrMM.x, inputUnits, METRIC_UNITS),
            y: this.convertUnits(PtInOrMM.y, inputUnits, METRIC_UNITS),
            z: this.convertUnits(PtInOrMM.z, inputUnits, METRIC_UNITS)
        };

        let points = this.getThreeClosestPoints(ptMM);
        if (points.length < 3) {
            console.log('Cant find 3 closest points');
            return PtInOrMM;
        }

        let normal = this.crossProduct3(this.sub3(points[1], points[0]), this.sub3(points[2], points[0]));
        let pp = points[0]; // point on plane
        let dz = 0; // compensation delta

        if (normal.z !== 0) {
            // find z at the point seg, on the plane defined by three points
            dz = pp.z - (normal.x * (ptMM.x - pp.x) + normal.y * (ptMM.y - pp.y)) / normal.z;
        } else {
            console.log(this.formatPt(ptMM), 'normal.z is zero', this.formatPt(points[0]), this.formatPt(points[1]), this.formatPt(points[2]));
        }

        return {
            x: this.convertUnits(ptMM.x, METRIC_UNITS, inputUnits),
            y: this.convertUnits(ptMM.y, METRIC_UNITS, inputUnits),
            z: this.convertUnits(ptMM.z + dz, METRIC_UNITS, inputUnits)
        };
    }

    convertUnits(value, inUnits, outUnits) {
        if (inUnits === METRIC_UNITS && outUnits === IMPERIAL_UNITS) {
            return value / 25.4;
        }
        if (inUnits === IMPERIAL_UNITS && outUnits === METRIC_UNITS) {
            return value * 25.4;
        }

        return value;
    }
}

export default App;
