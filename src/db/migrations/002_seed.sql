-- Deterministic development seed exported from the configured database.
-- User identifiers and roles are preserved; sensitive user fields are replaced.

BEGIN;

-- country
INSERT INTO public.country (id, name, acr, latitude, longitude, zoom) VALUES (1, 'Costa Rica', 'CR', 9.748900, -83.753400, 7) ON CONFLICT DO NOTHING;

-- zone
INSERT INTO public.zone (id, country_id, name, des, rank, is_active) VALUES (1, 1, 'North Zone', 'Northern Costa Rica birding region with Caribbean lowland rainforest, foothill forest, rivers, and major freshwater wetlands around Sarapiquí, San Carlos, Caño Negro, Arenal, Boca Tapada, and Bijagua.', 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.zone (id, country_id, name, des, rank, is_active) VALUES (2, 1, 'Guanacaste', 'Northwestern Costa Rica birding region dominated by tropical dry forest, seasonal wetlands, mangroves, coastal habitats, and volcanic foothills.', 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.zone (id, country_id, name, des, rank, is_active) VALUES (3, 1, 'Central Valley and Highlands', 'Central mountain birding region including cloud forest, volcanic highlands, oak forest, and páramo habitats that support many Costa Rica-Panama highland specialties.', 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.zone (id, country_id, name, des, rank, is_active) VALUES (4, 1, 'Central Pacific', 'Pacific-slope transition birding region where drier northern habitats meet wetter southern forests, especially around Carara, Tárcoles, Jacó, Manuel Antonio, and the Savegre lowlands.', 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.zone (id, country_id, name, des, rank, is_active) VALUES (5, 1, 'South Pacific and Osa', 'Southern Pacific lowland rainforest region including the Osa Peninsula, Golfo Dulce, Piedras Blancas, and Coto Brus; one of Costa Rica''s richest birding areas.', 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.zone (id, country_id, name, des, rank, is_active) VALUES (6, 1, 'Caribbean Lowlands and South Caribbean', 'Humid Caribbean coastal and lowland rainforest region from Tortuguero through the Talamanca Caribbean foothills and south Caribbean coast.', 6, true) ON CONFLICT DO NOTHING;

-- node
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (1, NULL, 1, 'Sarapiquí Rainforest Corridor', 1, 10.430000, -84.020000, 'Important Caribbean lowland rainforest birding corridor centered on Puerto Viejo de Sarapiquí and La Selva.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (2, NULL, 1, 'Caño Negro and Los Chiles Wetlands', 2, 10.900000, -84.770000, 'Northern wetland complex around Caño Negro, Río Frío, Los Chiles, and Medio Queso.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (3, NULL, 1, 'Boca Tapada Rainforest', 3, 10.690000, -84.190000, 'Remote Caribbean lowland rainforest region near the San Carlos River, known for macaws and rainforest birding lodges.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (4, NULL, 1, 'Arenal and La Fortuna Foothills', 4, 10.460000, -84.730000, 'Foothill rainforest and lake-edge birding region around Arenal Volcano and La Fortuna.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (5, NULL, 1, 'Tenorio-Bijagua and Río Celeste', 5, 10.730000, -85.020000, 'Transition-zone birding region around Bijagua, Tenorio Volcano, and Río Celeste, where Caribbean and Pacific influences meet.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (6, NULL, 2, 'Palo Verde and Tempisque Wetlands', 1, 10.350000, -85.350000, 'Major wetland and dry-forest birding region in the lower Tempisque basin.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (7, NULL, 2, 'Rincón de la Vieja and Liberia Foothills', 2, 10.830000, -85.320000, 'Dry forest to foothill forest birding region around Rincón de la Vieja National Park.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (8, NULL, 2, 'Santa Rosa and Santa Elena Peninsula', 3, 10.840000, -85.620000, 'Large protected dry-forest and coastal region in northwestern Guanacaste.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (9, NULL, 2, 'Miravalles and Bagaces Highlands', 4, 10.750000, -85.150000, 'Volcanic foothill and highland birding region east of Liberia and Bagaces.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (10, NULL, 2, 'Nicoya Peninsula Dry Forest and Coast', 5, 10.080000, -85.420000, 'Seasonal dry-forest and coastal birding region on the Nicoya Peninsula.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (11, NULL, 3, 'Monteverde Cloud Forest', 1, 10.300000, -84.800000, 'Classic Costa Rican cloud-forest birding region with reserves and private forest trails.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (12, NULL, 3, 'Talamanca Highlands - Savegre and Los Quetzales', 2, 9.550000, -83.800000, 'Highland cloud-forest and oak-forest region centered on San Gerardo de Dota and Los Quetzales National Park.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (13, NULL, 3, 'Central Volcanic Highlands', 3, 10.100000, -84.050000, 'Highland birding zone around Poás, Cinchona, Irazú, and nearby cloud forest.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (14, NULL, 3, 'Tapantí and Turrialba Foothills', 4, 9.760000, -83.780000, 'Wet Caribbean-slope foothill and montane forest birding region.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (15, NULL, 3, 'Braulio Carrillo and Quebrada González', 5, 10.160000, -83.950000, 'Caribbean-slope rainforest and foothill birding region along Route 32.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (16, NULL, 4, 'Carara and Tárcoles', 1, 9.780000, -84.610000, 'Important transition-zone birding region near Carara National Park and the Tárcoles River.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (17, NULL, 4, 'Manuel Antonio and Quepos', 2, 9.390000, -84.140000, 'Coastal Pacific forest and mangrove birding region around Quepos and Manuel Antonio.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (18, NULL, 4, 'Uvita and Ballena Coast', 3, 9.160000, -83.740000, 'Pacific coastal and foothill birding region around Uvita and Marino Ballena.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (19, NULL, 4, 'Savegre Lowlands and Dominical', 4, 9.250000, -83.860000, 'Pacific lowland and foothill region around Dominical and the lower Savegre basin.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (20, NULL, 5, 'Osa Peninsula and Corcovado', 1, 8.550000, -83.500000, 'Highly biodiverse Pacific lowland rainforest region centered on Corcovado National Park.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (21, NULL, 5, 'Golfo Dulce and Piedras Blancas', 2, 8.700000, -83.250000, 'Humid Pacific rainforest region around Golfo Dulce and Piedras Blancas National Park.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (22, NULL, 5, 'Coto Brus and Las Cruces', 3, 8.790000, -82.960000, 'Southern highland and foothill birding region near San Vito and the Panama border.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (23, NULL, 6, 'Tortuguero and Northern Caribbean Canals', 1, 10.540000, -83.500000, 'Canal, lagoon, swamp forest, and lowland rainforest birding region on the northern Caribbean coast.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (24, NULL, 6, 'Guápiles and Caribbean Foothills', 2, 10.200000, -83.780000, 'Caribbean lowland-to-foothill birding region near Guápiles, Guácimo, and Siquirres.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (25, NULL, 6, 'Puerto Viejo and Gandoca-Manzanillo', 3, 9.630000, -82.700000, 'South Caribbean coastal rainforest, beach, and wetland birding region.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (26, 1, 1, 'La Selva Biological Station', 1, 10.431000, -84.005000, 'Well-known OTS research station and one of Costa Rica''s classic lowland rainforest birding sites.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (27, 1, 1, 'Tirimbina Biological Reserve', 2, 10.410000, -84.120000, 'Accessible Sarapiquí rainforest reserve with trails and river forest habitat.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (28, 2, 1, 'Caño Negro Wildlife Refuge', 1, 10.900000, -84.770000, 'Major freshwater wetland and wildlife refuge known for waterbirds and marsh species.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (29, 2, 1, 'Medio Queso Wetlands', 2, 11.050000, -84.690000, 'Wetland and marsh area near Los Chiles, visited for northern wetland birds.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (30, 3, 1, 'Laguna del Lagarto Lodge', 1, 10.692000, -84.187000, 'Birding lodge and rainforest reserve in Boca Tapada.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (31, 3, 1, 'Maquenque Eco Lodge Area', 2, 10.670000, -84.185000, 'Rainforest lodge area within the San Carlos lowlands near Maquenque National Wildlife Refuge.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (32, 4, 1, 'Arenal Observatory Lodge', 1, 10.438000, -84.703000, 'Classic birding lodge on the forested slopes below Arenal Volcano.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (33, 4, 1, 'Mistico Arenal Hanging Bridges', 2, 10.488000, -84.756000, 'Foothill rainforest bridge trail near Arenal used for birding and wildlife watching.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (34, 5, 1, 'Tapir Valley Nature Reserve', 1, 10.750000, -85.020000, 'Private reserve near Bijagua known by birders for foothill forest and wetland-edge habitats.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (35, 5, 1, 'Heliconias Rainforest Lodge and Hanging Bridges', 2, 10.795000, -84.965000, 'Foothill rainforest lodge and hanging bridges near Bijagua.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (36, 5, 1, 'Tenorio Volcano National Park - Río Celeste', 3, 10.704000, -84.999000, 'National park sector visited for Río Celeste and Tenorio foothill forest.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (37, 6, 2, 'Palo Verde National Park', 1, 10.350000, -85.350000, 'Important national park with seasonal wetlands, dry forest, and waterbird concentrations.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (38, 6, 2, 'Palo Verde Biological Station', 2, 10.350000, -85.350000, 'OTS research station inside Palo Verde National Park.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (39, 6, 2, 'Hacienda Solimar', 3, 10.440000, -85.200000, 'Private ranch and wetland area visited by birding tours in Guanacaste.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (40, 7, 2, 'Rincón de la Vieja National Park', 1, 10.830000, -85.320000, 'Volcanic national park with dry forest, foothill forest, and higher elevation habitats.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (41, 7, 2, 'Curubandé Area', 2, 10.750000, -85.350000, 'Dry-forest and ranchland area near the main access to Rincón de la Vieja.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (42, 8, 2, 'Santa Rosa National Park', 1, 10.840000, -85.620000, 'Flagship protected tropical dry forest site in northwestern Costa Rica.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (43, 8, 2, 'Santa Elena Peninsula', 2, 10.920000, -85.910000, 'Remote coastal dry forest and marine-influenced area in the Área de Conservación Guanacaste.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (44, 9, 2, 'Miravalles Volcano Region', 1, 10.750000, -85.150000, 'Guanacaste highland and foothill forest region with cloud-forest influence.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (45, 9, 2, 'Cañas-Bagaces Dry Forest Corridor', 2, 10.430000, -85.080000, 'Dry-forest and open-country corridor around Cañas and Bagaces.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (46, 10, 2, 'Diriá National Park', 1, 10.080000, -85.420000, 'Protected dry forest in the Nicoya Peninsula.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (47, 10, 2, 'Junquillal Bay National Wildlife Refuge', 2, 10.940000, -85.700000, 'Coastal refuge with beach, mangrove, estuary, and dry-forest habitats.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (48, 11, 3, 'Monteverde Cloud Forest Biological Reserve', 1, 10.300000, -84.800000, 'Famous cloud-forest reserve and one of Costa Rica''s best-known birding sites.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (49, 11, 3, 'Curi-Cancha Reserve', 2, 10.310000, -84.815000, 'Private reserve in Monteverde with cloud forest and edge habitats used by birders.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (50, 12, 3, 'San Gerardo de Dota', 1, 9.560000, -83.800000, 'Highland valley and cloud-forest birding destination famous for Resplendent Quetzal.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (51, 12, 3, 'Los Quetzales National Park', 2, 9.550000, -83.800000, 'Protected highland cloud forest in the Talamanca range.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (52, 12, 3, 'Cerro de la Muerte', 3, 9.560000, -83.750000, 'High-elevation road-accessible páramo and oak-forest birding area.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (53, 13, 3, 'Poás-Cinchona Corridor', 1, 10.200000, -84.170000, 'Middle and high elevation birding corridor on the Caribbean slope of Poás.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (54, 13, 3, 'Irazú Volcano Highlands', 2, 9.980000, -83.850000, 'High-elevation volcanic habitats near Irazú.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (55, 14, 3, 'Tapantí National Park', 1, 9.760000, -83.780000, 'Very wet montane forest national park in the Orosi-Tapantí area.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (56, 14, 3, 'Rancho Naturalista', 2, 9.860000, -83.740000, 'Classic birding lodge near Turrialba with foothill forest and gardens.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (57, 14, 3, 'El Copal Reserve', 3, 10.230000, -84.340000, 'Caribbean slope foothill forest reserve visited by advanced birders.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (58, 15, 3, 'Quebrada González Sector', 1, 10.160000, -83.950000, 'Rainforest sector of Braulio Carrillo National Park along Route 32.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (59, 15, 3, 'Braulio Carrillo National Park', 2, 10.120000, -84.000000, 'Large protected area spanning Caribbean-slope rainforest and montane habitats.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (60, 16, 4, 'Carara National Park', 1, 9.780000, -84.610000, 'National park at the transition between tropical dry forest and humid Pacific forest.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (62, 16, 4, 'Cerro Lodge Area', 3, 9.760000, -84.630000, 'Birding lodge and dry-forest edge area near Carara and Tárcoles.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (64, 17, 4, 'Damas Island Mangroves', 2, 9.480000, -84.200000, 'Mangrove estuary near Quepos used for boat-based wildlife and birding tours.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (65, 18, 4, 'Marino Ballena National Park', 1, 9.160000, -83.740000, 'Coastal national park with marine, beach, mangrove, and nearby forest habitats.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (66, 18, 4, 'Uvita Foothills', 2, 9.180000, -83.750000, 'Pacific foothill forest and edge habitats above Uvita.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (61, 16, 4, 'Tárcoles River and Mangroves', 2, 10.165769, -85.177539, 'River and mangrove birding area near Carara and the Pacific coast.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (63, 17, 4, 'Manuel Antonio National Park', 1, 10.361009, -85.537570, 'Small but well-known coastal national park with humid Pacific forest.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (67, 19, 4, 'Hacienda Barú', 1, 9.280000, -83.880000, 'Private reserve near Dominical with forest, wetland, and coastal habitats.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (68, 19, 4, 'Portalón and Savegre Lowlands', 2, 9.320000, -83.930000, 'Lowland and foothill birding area between Quepos and Dominical.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (69, 20, 5, 'Corcovado National Park - Sirena', 1, 8.480000, -83.590000, 'Remote biological station area in Corcovado National Park''s lowland rainforest.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (70, 20, 5, 'Carate and La Leona', 2, 8.440000, -83.450000, 'Forest and coastal access area on the southeastern Osa Peninsula.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (71, 20, 5, 'Drake Bay', 3, 8.690000, -83.660000, 'Coastal rainforest birding base on the northwestern Osa Peninsula.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (72, 21, 5, 'Piedras Blancas National Park', 1, 8.700000, -83.250000, 'Lowland rainforest national park near Golfo Dulce.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (73, 21, 5, 'Esquinas Rainforest Lodge Area', 2, 8.700000, -83.210000, 'Rainforest lodge area near Piedras Blancas and Golfo Dulce.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (74, 22, 5, 'Las Cruces Biological Station', 1, 8.790000, -82.960000, 'OTS biological station and botanical garden near San Vito.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (75, 22, 5, 'San Vito Area', 2, 8.820000, -82.970000, 'Southern Costa Rica foothill and agricultural mosaic birding area.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (76, 23, 6, 'Tortuguero National Park', 1, 10.540000, -83.500000, 'Caribbean lowland national park known for canals, rainforest, and coastal wetlands.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (77, 23, 6, 'Tortuguero Village Canals', 2, 10.545000, -83.505000, 'Boat-based canal birding area around Tortuguero village.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (78, 24, 6, 'Guápiles Area', 1, 10.210000, -83.790000, 'Caribbean lowland town area used as access to nearby rainforest and foothill birding.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (79, 24, 6, 'Veragua Rainforest Area', 2, 9.930000, -83.190000, 'Caribbean-slope rainforest and aerial tram area near Limón.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (81, 25, 6, 'Cahuita National Park', 2, 9.740000, -82.840000, 'South Caribbean coastal national park with rainforest and coastal habitats.', true) ON CONFLICT DO NOTHING;
INSERT INTO public.node (id, parent_id, zone_id, name, rank, lat, lon, des, is_active) VALUES (80, 25, 6, 'Gandoca-Manzanillo Wildlife Refuge', 1, 10.917836, -85.148501, 'South Caribbean coastal refuge with rainforest, wetland, beach, and mangrove habitats.', true) ON CONFLICT DO NOTHING;

-- birds
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (1, 'agaher1', 'Agami Heron', '{wetland,rare}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (2, 'ameoys', 'American Oystercatcher', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (3, 'ampkin1', 'American Pygmy Kingfisher', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (4, 'baitro1', 'Baird''s Trogon', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (5, 'banwre1', 'Banded Wren', '{highland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (6, 'banumb1', 'Bare-necked Umbrellabird', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (7, 'btther1', 'Bare-throated Tiger-Heron', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (8, 'blagua1', 'Black Guan', '{highland,near-endemic}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (9, 'bawowl1', 'Black-and-white Owl', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (10, 'bayfly1', 'Black-and-yellow Silky-flycatcher', '{"Black-and-yellow Phainoptila"}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (11, 'baytan2', 'Black-and-yellow Tanager', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (12, 'blbhum1', 'Black-bellied Hummingbird', '{highland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (13, 'bbwduc', 'Black-bellied Whistling-Duck', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (14, 'bcatan1', 'Black-cheeked Ant-Tanager', '{endemic,pacific-slope}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (15, 'blchaw1', 'Black-collared Hawk', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (16, 'blccoq1', 'Black-crested Coquette', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (17, 'blcant1', 'Black-crowned Antpitta', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (18, 'wesant1', 'Black-crowned Antshrike', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (19, 'bewqua1', 'Black-eared Wood-Quail', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (20, 'blfsol1', 'Black-faced Solitaire', '{highland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (21, 'blhant2', 'Black-hooded Antshrike', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (22, 'bobher1', 'Boat-billed Heron', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (23, 'brnboo', 'Brown Booby', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (24, 'chbant1', 'Chestnut-backed Antbird', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (25, 'olcyel1', 'Olive-crowned Yellowthroat', '{"Chiriqui Yellowthroat"}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (26, 'colred1', 'Collared Redstart', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (27, 'coheme1', 'Coppery-headed Emerald', '{endemic,cloud-forest}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (28, 'dstkne', 'Double-striped Thick-knee', '{dry-forest}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (29, 'dumant1', 'Dull-mantled Antbird', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (30, 'eletro2', 'Elegant Trogon', '{dry-forest}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (31, 'noremt1', 'Northern Emerald-Toucanet', '{"Emerald Toucanet","Tucancillo Verde","Tucancito Verde"}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (32, 'father1', 'Fasciated Tiger-Heron', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (33, 'fepowl', 'Ferruginous Pygmy-Owl', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (34, 'fibara1', 'Fiery-billed Aracari', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (35, 'fithum1', 'Fiery-throated Hummingbird', '{highland,near-endemic}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (36, 'fltwar1', 'Flame-throated Warbler', '{highland,near-endemic}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (37, 'gobchl1', 'Golden-browed Chlorophonia', '{highland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (38, 'gonwoo1', 'Golden-naped Woodpecker', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (39, 'grbcra1', 'Gray-breasted Crake', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (40, 'grecur1', 'Great Curassow', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (41, 'grgmac', 'Great Green Macaw', '{caribbean-slope,rare,iconic}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (42, 'greibi1', 'Green Ibis', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (43, 'jabiru', 'Jabiru', '{wetland,rare}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (44, 'kebmot1', 'Keel-billed Motmot', '{caribbean-slope}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (45, 'kebtou1', 'Keel-billed Toucan', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (46, 'kinvul1', 'King Vulture', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (47, 'lattro1', 'Lattice-tailed Trogon', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (48, 'legcuc1', 'Lesser Ground-Cuckoo', '{dry-forest,rare}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (49, 'limpki', 'Limpkin', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (50, 'lotman1', 'Long-tailed Manakin', '{dry-forest}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (51, 'ltsfly1', 'Long-tailed Silky-flycatcher', '{highland,near-endemic}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (52, 'lovcot1', 'Lovely Cotinga', '{caribbean-slope,rare}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (53, 'magfri', 'Magnificent Frigatebird', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (54, 'manhum1', 'Mangrove Hummingbird', '{endemic,mangrove}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (55, 'manvir1', 'Mangrove Vireo', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (56, 'manwar1', 'Mangrove Yellow Warbler', '{highland,"Mangrove Warbler"}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (57, 'nicgra1', 'Nicaraguan Grackle', '{wetland,rare}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (58, 'nosfly1', 'Northern Scrub-Flycatcher', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (59, 'ocbant1', 'Ochre-breasted Antpitta', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (60, 'coltro1', 'Collared Trogon', '{"Orange-bellied Trogon","Trogón vientrianaranjado","Trogón collarejo"}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (61, 'orheag1', 'Ornate Hawk-Eagle', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (62, 'panfly1', 'Panama Flycatcher', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (63, 'pebfin1', 'Peg-billed Finch', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (64, 'pinbit1', 'Pinnated Bittern', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (65, 'prbbar1', 'Prong-billed Barbet', '{cloud-forest}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (66, 'redegr', 'Reddish Egret', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (67, 'resque1', 'Resplendent Quetzal', '{cloud-forest,highland,iconic}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (68, 'rivwre1', 'Riverside Wren', '{highland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (69, 'rosspo1', 'Roseate Spoonbill', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (70, 'rufgle1', 'Ruddy Foliage-gleaner', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (71, 'rufmot1', 'Rufous Motmot', '{dry-forest}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (72, 'ruwtan1', 'Rufous-winged Tanager', '{caribbean-slope}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (73, 'ruwwoo1', 'Rufous-winged Woodpecker', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (74, 'scaant1', 'Scaled Antpitta', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (75, 'scamac1', 'Scarlet Macaw', '{iconic,pacific-slope}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (76, 'semhaw', 'Semiplumbeous Hawk', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (77, 'sharpb1', 'Sharpbill', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (78, 'siftap1', 'Silvery-fronted Tapaculo', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (79, 'slttro1', 'Slaty-tailed Trogon', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (80, 'snakit', 'Snail Kite', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (81, 'snowca1', 'Snowcap', '{caribbean-slope,rare}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (82, 'snocot1', 'Snowy Cotinga', '{caribbean-slope}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (83, 'snbhum1', 'Snowy-bellied Hummingbird', '{highland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (84, 'soorob1', 'Sooty Thrush', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (85, 'stcant2', 'Streak-chested Antpitta', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (86, 'sunbit1', 'Sunbittern', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (87, 'sungre1', 'Sungrebe', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (88, 'tacfly1', 'Tawny-chested Flycatcher', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (89, 'thwbel', 'Three-wattled Bellbird', '{cloud-forest,migratory}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (90, 'timwre1', 'Timberline Wren', '{highland,near-endemic}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (91, 'todmot1', 'Tody Motmot', '{caribbean-slope}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (92, 'turcot1', 'Turquoise Cotinga', '{pacific-slope,rare}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (93, 'tubmot1', 'Turquoise-browed Motmot', '{dry-forest,iconic}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (94, 'voljun1', 'Volcano Junco', '{highland,near-endemic}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (95, 'whfnun1', 'White-fronted Nunbird', '{}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (96, 'wtmjay1', 'White-throated Magpie-Jay', '{dry-forest,iconic}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (97, 'wilplo', 'Wilson''s Plover', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (98, 'woosto', 'Wood Stork', '{wetland}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (99, 'yebcot1', 'Yellow-billed Cotinga', '{rare,pacific-slope}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (100, 'ycnher', 'Yellow-crowned Night Heron', '{squawk,wetland,"American Night Heron","Martinete Coronado"}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (101, 'yeetou1', 'Yellow-eared Toucanet', '{foothill}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (102, 'yenpar1', 'Yellow-naped Amazon', '{"Yellow-naped Parrot"}', true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds (id, species_code, name, tags, is_active) VALUES (103, 'yewvir1', 'Yellow-winged Vireo', '{highland,near-endemic}', true) ON CONFLICT DO NOTHING;

-- birds_by_node
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (26, 41, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (26, 82, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (26, 76, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (26, 40, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (26, 17, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (27, 41, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (27, 82, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (27, 40, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (27, 95, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (27, 32, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (28, 43, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (28, 57, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (28, 64, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (28, 87, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (28, 39, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (29, 57, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (29, 43, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (29, 64, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (29, 3, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (29, 87, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (30, 41, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (30, 1, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (30, 46, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (30, 73, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (30, 18, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (31, 41, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (31, 1, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (31, 82, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (31, 87, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (31, 42, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (32, 44, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (32, 52, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (32, 61, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (32, 16, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (32, 95, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (33, 44, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (33, 71, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (33, 95, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (33, 29, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (33, 16, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (34, 91, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (34, 72, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (34, 101, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (34, 52, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (34, 44, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (35, 91, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (35, 72, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (35, 101, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (35, 44, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (35, 19, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (36, 101, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (36, 8, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (36, 91, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (36, 72, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (36, 31, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (37, 43, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (37, 69, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (37, 22, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (37, 15, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (37, 80, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (38, 43, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (38, 49, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (38, 7, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (38, 13, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (38, 96, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (39, 43, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (39, 98, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (39, 69, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (39, 80, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (39, 28, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (40, 91, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (40, 89, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (40, 20, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (40, 8, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (40, 30, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (41, 96, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (41, 93, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (41, 30, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (41, 48, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (41, 50, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (42, 50, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (42, 48, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (42, 93, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (42, 96, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (42, 30, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (43, 96, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (43, 30, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (43, 55, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (43, 23, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (43, 53, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (44, 8, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (44, 20, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (44, 67, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (44, 31, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (44, 26, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (45, 96, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (45, 93, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (45, 28, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (45, 30, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (45, 48, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (46, 50, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (46, 96, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (46, 30, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (46, 48, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (46, 5, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (47, 2, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (47, 56, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (47, 69, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (47, 66, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (47, 97, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (48, 67, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (48, 89, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (48, 8, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (48, 65, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (48, 37, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (49, 67, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (49, 89, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (49, 8, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (49, 60, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (49, 65, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (50, 67, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (50, 35, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (50, 36, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (50, 51, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (50, 103, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (51, 67, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (51, 8, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (51, 35, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (51, 26, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (51, 36, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (52, 94, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (52, 90, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (52, 63, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (52, 35, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (52, 84, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (53, 27, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (53, 65, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (53, 8, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (53, 67, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (53, 12, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (54, 94, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (54, 90, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (54, 35, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (54, 84, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (54, 63, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (55, 78, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (55, 59, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (55, 8, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (55, 10, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (55, 74, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (56, 81, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (56, 88, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (56, 86, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (56, 47, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (56, 77, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (57, 6, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (57, 77, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (57, 47, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (57, 11, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (57, 88, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (58, 17, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (58, 47, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (58, 77, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (58, 95, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (58, 29, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (59, 6, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (59, 17, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (59, 47, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (59, 61, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (59, 77, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (60, 75, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (60, 34, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (60, 4, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (60, 21, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (60, 85, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (61, 54, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (61, 62, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (61, 22, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (61, 69, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (61, 75, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (62, 75, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (62, 9, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (62, 33, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (62, 93, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (62, 102, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (63, 4, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (63, 34, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (63, 68, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (63, 21, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (63, 24, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (64, 54, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (64, 62, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (64, 22, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (64, 58, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (64, 100, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (65, 34, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (65, 4, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (65, 68, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (65, 75, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (65, 92, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (66, 92, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (66, 4, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (66, 34, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (66, 14, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (66, 38, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (67, 34, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (67, 4, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (67, 68, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (67, 21, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (67, 75, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (68, 92, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (68, 34, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (68, 4, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (68, 68, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (68, 38, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (69, 14, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (69, 99, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (69, 4, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (69, 34, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (69, 40, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (70, 14, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (70, 99, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (70, 75, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (70, 4, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (70, 40, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (71, 14, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (71, 4, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (71, 34, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (71, 75, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (71, 40, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (72, 14, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (72, 99, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (72, 4, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (72, 34, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (72, 40, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (73, 14, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (73, 4, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (73, 34, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (73, 68, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (73, 40, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (74, 83, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (74, 92, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (74, 14, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (74, 70, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (74, 25, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (75, 83, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (75, 92, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (75, 25, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (75, 14, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (75, 70, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (76, 1, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (76, 41, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (76, 87, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (76, 82, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (76, 42, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (77, 1, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (77, 87, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (77, 22, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (77, 42, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (77, 7, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (78, 82, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (78, 41, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (78, 95, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (78, 76, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (78, 40, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (79, 82, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (79, 17, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (79, 47, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (79, 29, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (79, 95, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (80, 41, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (80, 82, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (80, 1, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (80, 79, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (80, 42, 5, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (81, 41, 1, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (81, 79, 2, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (81, 71, 3, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (81, 95, 4, true) ON CONFLICT DO NOTHING;
INSERT INTO public.birds_by_node (node_id, bird_id, rank, is_active) VALUES (81, 45, 5, true) ON CONFLICT DO NOTHING;

-- plans
INSERT INTO public.plans (id, name, max_chats, max_identifications, created_at, updated_at) VALUES (1, 'FREE', 20, 5, '2026-06-19 16:50:16.682496+00', '2026-06-19 16:50:16.682496+00') ON CONFLICT DO NOTHING;
INSERT INTO public.plans (id, name, max_chats, max_identifications, created_at, updated_at) VALUES (2, 'PRO', 500, 100, '2026-06-19 16:50:16.682496+00', '2026-06-19 16:50:16.682496+00') ON CONFLICT DO NOTHING;
INSERT INTO public.plans (id, name, max_chats, max_identifications, created_at, updated_at) VALUES (3, 'GUIDE', 1200, 300, '2026-07-08 16:32:45.361009+00', '2026-07-08 16:32:45.361009+00') ON CONFLICT DO NOTHING;

-- users
-- Production emails, names, password hashes, profile-image keys, and suspension
-- metadata are deliberately not exported. Both rows use the same fixed,
-- non-production bcrypt placeholder.
INSERT INTO public.users (
  id, email, name, password_hash, created_at, updated_at, role,
  profile_image_key, suspended_at, suspended_by, suspension_reason_code
) VALUES (
  1,
  'admin@example.test',
  'Development Admin',
  '$2b$10$3blxVbE4RK0jsmTkcNv9duISbIMfV0Z3ivFqe9Go.Ra32pzg7AeZ6',
  '2026-05-17 23:32:53.270+00',
  '2026-07-28 19:18:24.922+00',
  'admin',
  NULL, NULL, NULL, NULL
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  profile_image_key = NULL,
  suspended_at = NULL,
  suspended_by = NULL,
  suspension_reason_code = NULL,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.users (
  id, email, name, password_hash, created_at, updated_at, role,
  profile_image_key, suspended_at, suspended_by, suspension_reason_code
) VALUES (
  2,
  'guide@example.test',
  'Development Guide',
  '$2b$10$3blxVbE4RK0jsmTkcNv9duISbIMfV0Z3ivFqe9Go.Ra32pzg7AeZ6',
  '2026-06-13 03:45:09.670+00',
  '2026-08-18 21:46:13.322+00',
  'tour guide',
  NULL, NULL, NULL, NULL
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  profile_image_key = NULL,
  suspended_at = NULL,
  suspended_by = NULL,
  suspension_reason_code = NULL,
  updated_at = EXCLUDED.updated_at;

-- Explicit identifiers above must not leave serial sequences behind the data.
SELECT pg_catalog.setval('public.birds_id_seq', (SELECT MAX(id) FROM public.birds), true);
SELECT pg_catalog.setval('public.country_id_seq', (SELECT MAX(id) FROM public.country), true);
SELECT pg_catalog.setval('public.node_id_seq', (SELECT MAX(id) FROM public.node), true);
SELECT pg_catalog.setval('public.plans_id_seq', (SELECT MAX(id) FROM public.plans), true);
SELECT pg_catalog.setval('public.users_id_seq', (SELECT MAX(id) FROM public.users), true);
SELECT pg_catalog.setval('public.zone_id_seq', (SELECT MAX(id) FROM public.zone), true);

COMMIT;
