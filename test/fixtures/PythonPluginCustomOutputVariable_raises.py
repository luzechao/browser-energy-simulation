"""A PythonPlugin that fails on purpose: EnergyPlus must report the traceback and stop cleanly."""

from pyenergyplus.plugin import EnergyPlusPlugin


class AverageZoneTemps(EnergyPlusPlugin):
    def on_end_of_zone_timestep_before_zone_reporting(self, state) -> int:
        raise ValueError("deliberate failure from test fixture")
