package com.fieldwork.repository;

import com.fieldwork.entity.User;
import com.fieldwork.entity.WorkGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WorkGroupRepository extends JpaRepository<WorkGroup, Long> {

    List<WorkGroup> findByLeader(User leader);
}