package com.fieldwork.repository;

import com.fieldwork.entity.Location;
import com.fieldwork.entity.LocationAssignment;
import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LocationAssignmentRepository
        extends JpaRepository<LocationAssignment, Long> {

    List<LocationAssignment> findByGroup(
            WorkGroup group
    );

    List<LocationAssignment> findByAssignee(
            User assignee
    );

    Optional<LocationAssignment> findByGroupAndLocation(
            WorkGroup group,
            Location location
    );
}