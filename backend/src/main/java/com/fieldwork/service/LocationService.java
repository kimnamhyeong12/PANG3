package com.fieldwork.service;

import com.fieldwork.entity.Location;
import com.fieldwork.repository.LocationRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class LocationService {

    private final LocationRepository repo;

    public LocationService(LocationRepository repo){
        this.repo = repo;
    }

    public List<Location> getAllLocations(){
        return repo.findAll();
    }

    public Location saveLocation(Location location){
        return repo.save(location);
    }
}