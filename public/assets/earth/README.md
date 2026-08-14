# Earth surface asset

`nasa-blue-marble-2004-12.jpg` is NASA's December 2004 Blue Marble Next
Generation composite with topography and bathymetry.

- Source: https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg
- Publisher: NASA Earth Observatory / Visible Earth
- Dimensions: 5400 × 2700 pixels
- SHA-256: `A9F0088972DEE0254610AF851C4D6838CA3F2CF79176987E0A5713E2C15EC042`

The asset is bundled as the network-independent, full-geographic base layer.
Online ArcGIS imagery can upgrade the visible mid-latitude surface at runtime.

`nasa-black-marble-2012.jpg` is NASA Earth Observatory's 2012 Black Marble
night-lights composite.

- Source: https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg
- Publisher: NASA Earth Observatory / Visible Earth
- Dimensions: 3600 x 1800 pixels
- SHA-256: `373E5A08C9F378A2CE6320214A613148E4B1E3946B3F39A516C9093B76CB7124`

Orbital Vision renders this layer only on the unlit hemisphere through
Cesium's day/night imagery alpha blending.

`nasa-geos5-clouds-0350.png` is frame 350 of NASA SVS visualization 3837,
"Components of the Water Cycle on a Flat Map for Science On a Sphere." The
source TIFF was converted losslessly to PNG so WebView2 can preserve its alpha
channel.

- Source page: https://svs.gsfc.nasa.gov/3837
- Source frame: https://svs.gsfc.nasa.gov/vis/a000000/a003800/a003837/frames/2048x1024_2x1_30p/Clouds/clouds.0350.tif
- Publisher: NASA Goddard Space Flight Center Scientific Visualization Studio
- Dimensions: 2048 × 1024 pixels
- SHA-256: `EF0954A85696EFE2D795452BF69517889831B9256F3683E89A8E0BB0C178693E`

The scientific cloud layer replaces the earlier billboard cloud approximation
and uses separate day/night opacity for realistic lighting integration.
