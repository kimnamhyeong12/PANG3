package com.fieldwork.service;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class WorkRegionTest {
    @Test void citiesWithGuRequireCorrectGu() {
        assertThrows(IllegalArgumentException.class, () -> WorkRegion.validate("충청남도", "천안시"));
        assertThrows(IllegalArgumentException.class, () -> WorkRegion.validate("충청남도", "천안시 사하구"));
        assertDoesNotThrow(() -> WorkRegion.validate("충청남도", "천안시 동남구"));
        assertDoesNotThrow(() -> WorkRegion.validate("경기도", "화성시 동탄구"));
    }
    @Test void ordinaryDistrictsAndCitiesUseTwoLevels() {
        assertDoesNotThrow(() -> WorkRegion.validate("부산광역시", "사하구"));
        assertDoesNotThrow(() -> WorkRegion.validate("충청남도", "아산시"));
        assertDoesNotThrow(() -> WorkRegion.validate("세종특별자치시", "세종특별자치시"));
        assertThrows(IllegalArgumentException.class, () -> WorkRegion.validate("충청남도", "사하구"));
    }
    @Test void missingAndUnknownRegionsAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> WorkRegion.validate(null, "사하구"));
        assertThrows(IllegalArgumentException.class, () -> WorkRegion.validate("부산광역시", ""));
        assertThrows(IllegalArgumentException.class, () -> WorkRegion.validate("없는 지역", "사하구"));
    }
    @Test void existingNamesRemainRecognized() {
        assertDoesNotThrow(() -> WorkRegion.validate("전라북도", "전주시 완산구"));
        assertDoesNotThrow(() -> WorkRegion.validate("광주광역시", "광산구"));
    }
}
