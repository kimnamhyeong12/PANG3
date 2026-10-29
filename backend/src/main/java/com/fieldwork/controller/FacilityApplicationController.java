package com.fieldwork.controller;
import com.fieldwork.service.*;
import com.fieldwork.security.CurrentUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
import org.springframework.core.io.*;
@RestController
public class FacilityApplicationController {
    private final FacilityRegistryService registry;private final ObjectMapper json;
    public FacilityApplicationController(FacilityRegistryService registry,ObjectMapper json){this.registry=registry;this.json=json;}
    @GetMapping("/api/public-data/categories") public Object categories(){return registry.categories();}
    @PostMapping(value="/api/facility-applications",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public Object submit(@RequestPart("application") String payload,@RequestPart("photo") MultipartFile photo,@RequestPart(value="screenshot",required=false) MultipartFile screenshot){
        FacilityRegistryService.Input input;
        try { input=json.readValue(payload,FacilityRegistryService.Input.class); }
        catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,"신청 내용을 확인해 주세요.");}
        return java.util.Map.of("id",registry.submit(CurrentUser.id(),input,photo,screenshot));
    }
    @GetMapping("/api/facility-applications") public ResponseEntity<?> mine(@RequestParam(defaultValue="0")int page){return noStore(registry.list(CurrentUser.id(),false,page));}
    @GetMapping("/api/facility-applications/{id}") public ResponseEntity<?> own(@PathVariable Long id){return noStore(registry.read(CurrentUser.id(),id,false));}
    @GetMapping("/api/admin/facility-applications") public ResponseEntity<?> all(@RequestParam(defaultValue="0")int page){return noStore(registry.list(CurrentUser.id(),true,page));}
    @GetMapping("/api/admin/facility-applications/{id}") public ResponseEntity<?> read(@PathVariable Long id){return noStore(registry.read(CurrentUser.id(),id,true));}
    @PostMapping("/api/admin/facility-applications/{id}/review") public ResponseEntity<?> review(@PathVariable Long id,@RequestBody FacilityRegistryService.Review review){return noStore(registry.review(CurrentUser.id(),id,review));}
    @GetMapping("/api/facility-applications/{id}/evidence/{kind}")public ResponseEntity<Resource> ownPhoto(@PathVariable Long id,@PathVariable String kind){return image(id,kind,false);}
    @GetMapping("/api/admin/facility-applications/{id}/evidence/{kind}")public ResponseEntity<Resource> adminPhoto(@PathVariable Long id,@PathVariable String kind){return image(id,kind,true);}
    private ResponseEntity<Resource> image(Long id,String kind,boolean admin){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.IMAGE_JPEG).header("X-Content-Type-Options","nosniff").body(new FileSystemResource(registry.image(CurrentUser.id(),id,kind,admin)));}
    private static ResponseEntity<?> noStore(Object body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
}
