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

                for (const match_groups of [...line.matchAll(parser)]) {
                    const match = match_groups[1];
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

            log.info(`New BBox: xmin: ${xmin} xmax: ${xmax} ymin: ${ymin} ymax: ${ymax}`);
            this.setState({
                bbox: {
                    min: { x: xmin, y: ymin },
                    max: { x: xmax, y: ymax }
                }
            });
        },
        'gcode:unload': () => {
            this.setState({ gcodeLoaded: false });
        },
        'serialport:open': (options) => {
            const { port } = options;
            this.setState({ port: port });
        },
        'serialport:close': (options) => {
            const initialState = this.getInitialState();
            this.setState({ ...initialState });
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
                    status: { mpos, wpos },
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
                    }
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
            bbox: {
                min: {
                    x: 0,
                    y: 0,
                },
                max: {
                    x: 0,
                    y: 0,
                }
            },
            isAutolevelRunning: false,
            delta: 10.0,
            zSafe: 3.0,
            feedrate: 25,
            margin: 2.5,
            gcodeLoaded: false
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

    startAutolevel() {
        // Code got from https://github.com/kreso-t/cncjs-kt-ext
        log.info('Starting autoleveling');
        this.setState({ isAutolevelRunning: true });

        let workCoordinates = {
            x: this.state.machinePosition.x - this.state.workPosition.x,
            y: this.state.machinePosition.y - this.state.workPosition.y,
            z: this.state.machinePosition.z - this.state.workPosition.z
        };

        log.info(`Work Coordinates: ${JSON.stringify(workCoordinates)}`);

        let code = [];
        let xmin = this.state.bbox.min.x - this.state.margin;
        let xmax = this.state.bbox.max.x + this.state.margin;
        let ymin = this.state.bbox.min.y - this.state.margin;
        let ymax = this.state.bbox.max.y + this.state.margin;

        let dx = (xmax - xmin) / parseInt((xmax - xmin) / this.state.delta, 10);
        let dy = (ymax - ymin) / parseInt((ymax - ymin) / this.state.delta, 10);
        // TODO: Use the controller to send motion/whatever commands
        // like the Probe widget:
        // https://github.com/cncjs/cncjs/blob/6f2ec1574eace3c99b4a18c3de199b222524d0e1/src/app/widgets/Probe/index.jsx#L132
        code.push('(AL: probing initial point)');
        code.push('G21');
        code.push('G90');
        code.push(`G0 Z${this.state.zSafe}`);
        code.push(`G0 X${xmin.toFixed(3)} Y${ymin.toFixed(3)} Z${this.state.zSafe}`);
        code.push(`G38.2 Z-${this.state.zSafe + 1} F${this.state.feedrate / 2}`);
        code.push('G10 L20 P1 Z0'); // set the z zero
        code.push(`G0 Z${this.state.zSafe}`);

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
            }
        }

        log.info(`Sending GCode:\n${code.join('\n')}\n`);

        this.setState({ isAutolevelRunning: false });
    }
}

export default App;
