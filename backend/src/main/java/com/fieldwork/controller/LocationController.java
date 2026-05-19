package com.fieldwork.controller;

import com.fieldwork.entity.Location;
import com.fieldwork.service.LocationService;

import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/locations")
@CrossOrigin("*")
public class LocationController {

    private final LocationService service;

    public LocationController(LocationService service){
        this.service = service;
    }

    @GetMapping
    public List<Location> getLocations(){
        return service.getAllLocations();
    }


    @PostMapping
    public Location createLocation(
            @RequestBody Location location
    ){
        return service.saveLocation(location);
    }

    @PatchMapping("/{id}/status")
    public Location updateStatus(
            @PathVariable Long id,
            @RequestBody Location location
    ) {
        return service.updateStatus(id, location.getStatus());
    }

}