import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeaturesStudio } from './features-studio';

describe('FeaturesStudio', () => {
  let component: FeaturesStudio;
  let fixture: ComponentFixture<FeaturesStudio>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturesStudio],
    }).compileComponents();

    fixture = TestBed.createComponent(FeaturesStudio);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
