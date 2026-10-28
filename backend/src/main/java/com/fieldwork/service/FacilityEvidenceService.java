package com.fieldwork.service;
import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.exif.GpsDirectory;
import com.fieldwork.config.FieldworkProperties;
import com.fieldwork.util.ProjectPaths;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
@Service
public class FacilityEvidenceService {
    private final Path root; private final FileStorageService images; private final FieldworkProperties.Upload limits;
    private static final Object LOCK=new Object();
    public FacilityEvidenceService(FieldworkProperties properties,FileStorageService images){root=ProjectPaths.resolve(properties.getUpload().getBaseDir()).toAbsolutePath().normalize().resolve("facility-evidence");this.images=images;limits=properties.getUpload();}
    public record Photo(byte[] image,double lat,double lng){}
    private byte[] bytes(MultipartFile file){
        if(file==null||file.isEmpty()||file.getSize()>Math.min(limits.getMaxFileBytes(),15L*1024*1024))throw bad("사진은 15MB 이하의 JPG 또는 PNG 원본을 선택해 주세요.");
        try(var input=file.getInputStream()){byte[] data=input.readNBytes(15*1024*1024+1);if(data.length>15*1024*1024)throw bad("사진은 15MB 이하여야 합니다.");return data;}catch(IOException e){throw bad("사진을 읽을 수 없습니다.");}
    }
    public synchronized Photo original(MultipartFile file){
        byte[] data=bytes(file);
        try {
            var metadata=ImageMetadataReader.readMetadata(new ByteArrayInputStream(data));
            var gps=metadata.getFirstDirectoryOfType(GpsDirectory.class);var geo=gps==null?null:gps.getGeoLocation();
            if(geo==null||geo.isZero()||!Double.isFinite(geo.getLatitude())||!Double.isFinite(geo.getLongitude())||Math.abs(geo.getLatitude())>90||Math.abs(geo.getLongitude())>180)throw bad("시설물 원본 사진에서 촬영 위치를 확인하지 못했습니다. 위치정보가 있는 JPG·PNG 원본을 선택해 주세요.");
            return new Photo(images.sanitize(data),geo.getLatitude(),geo.getLongitude());
        }catch(ResponseStatusException e){throw e;}catch(Exception e){throw bad("촬영 위치정보가 있는 JPG·PNG 원본 사진을 선택해 주세요.");}
    }
    public synchronized byte[] screenshot(MultipartFile file){try{return images.sanitize(bytes(file));}catch(IOException e){throw bad("지도 스크린샷을 확인해 주세요.");}}
    public String save(Long userId,byte[] data){
        if(!TransactionSynchronizationManager.isSynchronizationActive())throw new IllegalStateException("Evidence requires a transaction");
        try { synchronized(LOCK){
            Path directory=root.resolve(userId.toString());Files.createDirectories(directory);
            if(!directory.toRealPath().startsWith(root.toRealPath())||!root.toRealPath().startsWith(root.getParent().toRealPath())||Files.isSymbolicLink(root)||Files.isSymbolicLink(directory))throw bad("사진 보관 위치가 올바르지 않습니다.");
            long total=0,owned=0;int count=0;
            try(var paths=Files.walk(root)){var it=paths.iterator();while(it.hasNext()){Path p=it.next();if(!Files.isRegularFile(p,LinkOption.NOFOLLOW_LINKS))continue;long size=Files.size(p);total+=size;if(p.startsWith(directory))owned+=size;if(++count>20000)throw bad("사진 보관 한도를 초과했습니다.");}}
            if(total+data.length>limits.getMaxTotalBytes()||owned+data.length>limits.getMaxUserBytes())throw bad("사진 보관 한도를 초과했습니다.");
            String key=userId+"/"+UUID.randomUUID()+".jpg";Path target=root.resolve(key);
            try(var output=Files.newOutputStream(target,StandardOpenOption.CREATE_NEW)){TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){public void afterCompletion(int status){if(status!=STATUS_COMMITTED)try{Files.deleteIfExists(target);}catch(IOException ignored){}}});output.write(data);}
            return key;
        }}catch(IOException e){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"사진을 저장하지 못했습니다. 다시 시도해 주세요.");}
    }
    public Path read(String key){try{if(key==null||!key.matches("[0-9]+/[a-f0-9-]+\\.jpg"))throw new IOException();Path path=root.resolve(key);if(!path.toRealPath().startsWith(root.toRealPath())||!Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS))throw new IOException();return path;}catch(IOException e){throw new ResponseStatusException(HttpStatus.NOT_FOUND,"사진을 찾을 수 없습니다.");}}
    private static ResponseStatusException bad(String reason){return new ResponseStatusException(HttpStatus.BAD_REQUEST,reason);}
}
