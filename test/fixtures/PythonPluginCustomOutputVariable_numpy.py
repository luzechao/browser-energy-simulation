"""numpy re-implementation of EnergyPlus's PythonPluginCustomOutputVariable.AverageZoneTemps.

Same module/class contract as the stock example, so the stock IDF runs unchanged. Used by
test/ep_pyodide_plugin_gate.mjs to show that a PythonPlugin can import a compiled Pyodide package.
"""

import numpy as np
from pyenergyplus.plugin import EnergyPlusPlugin

ZONES = ["perimeter_zn_1", "perimeter_zn_2", "perimeter_zn_3", "perimeter_zn_4", "core_zn"]


class AverageZoneTemps(EnergyPlusPlugin):
    def __init__(self):
        super().__init__()
        self.volumes = None
        self.temp_handles = None
        self.avg_handle = None

    def on_end_of_zone_timestep_before_zone_reporting(self, state) -> int:
        exchange = self.api.exchange
        if self.volumes is None:
            self.volumes = np.array(
                [
                    exchange.get_internal_variable_value(
                        state, exchange.get_internal_variable_handle(state, "Zone Air Volume", zone)
                    )
                    for zone in ZONES
                ]
            )
            self.temp_handles = [exchange.get_variable_handle(state, "Zone Mean Air Temperature", z) for z in ZONES]
            self.avg_handle = exchange.get_global_handle(state, "AverageBuildingTemp")
        temps = np.fromiter((exchange.get_variable_value(state, h) for h in self.temp_handles), dtype=float)
        exchange.set_global_value(state, self.avg_handle, float(np.average(temps, weights=self.volumes)))
        return 0
